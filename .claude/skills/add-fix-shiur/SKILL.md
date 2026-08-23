---
name: add-fix-shiur
description: Handles one-off manual additions and corrections to individual shiurim (lectures) on the YBT/TTL-app site — as opposed to the continuous email/Zoom, Drive, or bulk-migration ingest pipelines, which run unattended. Use this whenever the user says "add shiur" or "fix shiur", or otherwise asks to add a single new lecture, replace/repair a broken recording, correct a wrong title/speaker/date/description, move a miscategorized shiur to the right place, or upload a specific recording (a local file, or a link like classic.yutorah.org/lectures/lecture_iframe.cfm/...) to the site. Also trigger for requests like "this shiur's audio is broken, can you fix it", "I have a recording from Rabbi X I need to add", or "shiur ID YBT-12345 has the wrong date". Do NOT use this for setting up or debugging the automated ingest pipelines themselves (Zoom email forwarding, Drive sync, weekly Schneeweiss migration) — those are separate, ongoing systems documented in the repo's CLAUDE.md.
---

# Add / Fix Shiur

One-off, human-in-the-loop edits to `shiurim-app/data/lectures.json` — adding a single new
lecture or repairing an existing one — as distinct from this repo's three *continuous* ingest
pipelines (Zoom email forward, Google Drive sync, Schneeweiss YUTorah migration), which run
unattended on their own triggers. Everything here is triggered explicitly by the user, for a
specific shiur (or a small handful) they name.

Two scripts do the mechanical work, both in `shiurim-app/scripts/` (co-located with the repo's
other one-off fix scripts like `ingest-shiur.js` and `fix-misrouted-lectures.js`, for the same
reason: they need the project's own `node_modules`, since this repo has no `ts-node`/`tsx` to
run TypeScript standalone):

- **`categorize-shiur.mjs`** — advisory only, proposes a category placement. Never writes anything.
- **`add-or-fix-shiur.js`** — does the actual work: downloads/converts audio, uploads to R2,
  mutates `data/lectures.json`, regenerates the static site data, verifies placement.

All commands below assume the working directory is `shiurim-app/`.

## Before you start

Read `data/folder-hierarchy.json` (or at least skim its top-level category ids/labels) so you
can recognize valid node ids when the user names a category, and confirm a proposed node exists
before passing it to the script. Node ids are lowercase-hyphenated (e.g. `gemarah-berachot`,
`bereishit-noach`) — only **leaf** nodes (no `children` array) can hold lectures.

## Add shiur

1. **Gather what you have.** The user will give you one of:
   - A YUTorah link, e.g. `https://classic.yutorah.org/lectures/lecture_iframe.cfm/927564/...`
     → pass the whole URL as `--yutorah-url`; the script extracts the shiur id and, if the URL
     contains an `Affiliate~CFM~<id>~` fragment (some affiliates, like YBT's own org, need this —
     see "YUTorah id/org lookup" below), the org id too. Title, description, speaker, and date
     come from the YUTorah API automatically — you don't need to ask the user for them.
   - A bare YUTorah shiur id → `--yutorah-id <id>` (same auto-fetched metadata; add
     `--yutorah-org <id>` yourself if you know the source isn't the default org).
   - A downloaded local audio file → `--audio-file "<path>"`, plus you must ask for **title**
     and **speaker** if not already given (description and date are optional; date defaults to
     today).
   - A direct link to an audio file elsewhere (not YUTorah) → `--audio-url "<url>"`, same
     title/speaker requirement as a local file. If the link is to a webpage rather than a raw
     audio file, you can't fetch it this way — ask the user to download it and hand you the file.
   - If the user also has a **sources PDF** for the shiur (a document listing the sources cited),
     ask for it if they mention one — a local file → `--pdf-file "<path>"`, or a direct link →
     `--pdf-url "<url>"`. Optional; only include if they have one.

2. **Decide category placement.** If the user told you exactly where it goes (a node id or an
   unambiguous label), use that. Otherwise run:
   ```
   node scripts/categorize-shiur.mjs --title "<title>" --description "<description>"
   ```
   It returns `{ tier, confidence, nodePath, labels, alternatives }`. `nodePath` is the full
   root-to-leaf id chain (e.g. `["gemarah", "gemarah-berachot"]`) — the **last** element is the
   leaf you'll place the lecture in.
   - `confidence: "high"` (tier 1 rule match, or tier 2 Haiku confident) → proceed without asking.
   - `confidence: "low"` → **check with the user before uploading anything.** Show them the
     title, the proposed placement (use `labels` for readability), and the `alternatives` if any.
     Don't guess past a low-confidence result — this is exactly the case the user asked to be
     looped in on.

3. **Dry-run first.** Always do this before touching R2 or the JSON file:
   ```
   node scripts/add-or-fix-shiur.js --mode add --dry-run \
     --node-path <leaf-id> \
     --yutorah-url "<url>"        # or --yutorah-id / --audio-file / --audio-url
   ```
   Add `--title`/`--speaker`/`--description`/`--date`/`--tags`/`--pdf-file`/`--pdf-url` as needed
   (tags is a comma-separated list). For cross-listing the same shiur into more than one category, pass
   `--node-path` as a comma-separated list of leaf ids (e.g. `--node-path node-a,node-b`) — this
   inserts the identical lecture object (same id) into each node's `lectures[]`, the pattern this
   repo already uses for cross-listed shiurim (see `docs/schneeweiss-migration.md`).

   Read the dry-run's JSON output: the id it picked, the resolved title/speaker/date, the R2 key,
   and the duration (a duration of `null` or `0`, or a large `driftSeconds`, means the audio
   didn't decode cleanly — investigate before going further). Show the user a short summary and
   get their go-ahead if anything looks off, especially the title/date/speaker if they came from
   an auto-fetched source rather than something the user typed themselves.

4. **Run for real** (same command, minus `--dry-run`). This uploads the audio to R2 (key mirrors
   the category tree path, e.g. `gemarah/gemarah-berachot/<id>.mp3`), writes
   `data/lectures.json` (after making a timestamped backup — the script does this automatically,
   matching every other fix script in this repo), regenerates `public/lectures-data/`, and
   verifies the lecture actually landed in the generated node file and `catalog.json`. If
   `verify` shows `present: false` for a node or `inCatalog: false`, stop and investigate — don't
   proceed to commit.

5. **Commit and push to `main`** (this triggers a Vercel deploy — that's expected and is how the
   user wants this skill to work, confirmed when this skill was built). Stage `data/lectures.json`
   plus the two skill scripts if this is their first use, write a commit message naming the shiur
   (e.g. `add shiur: "Even HaEzer Bootcamp #1" (Rabbi Zev Cinamon)`), and push. Do **not** commit
   the timestamped `data/lectures.backup-*.json` file the script creates — leave it on disk as a
   local safety net (this repo's `.gitignore` may or may not already exclude it; check before
   staging, and never sweep it in with a blanket `git add -A`/`git add .`).

## Fix shiur

1. **Get the lecture id** from the user (e.g. `YBT-927564`, `MISC-03`, `INGEST-20260710-a1b2c3`).
   If they only have a title or a URL, look it up first — for YUTorah-sourced shiurim you can
   grep `data/lectures.json` for the shiur id, or ask the user to check the site.

2. **Figure out what's actually wrong** from what the user tells you, and map it to flags:
   - Wrong title/description/speaker/date → `--title`/`--description`/`--speaker`/`--date`.
   - Wrong/missing tags → `--tags` (comma-separated; replaces the existing list).
   - Broken or wrong recording → replace the audio the same way as "add" (`--yutorah-url`,
     `--yutorah-id`, `--audio-file`, or `--audio-url`). The script deletes the old R2 object
     automatically **if and only if** the old `audioUrl` actually pointed at this bucket — some
     legacy lectures link to an original external host, and those are left untouched since
     deleting them isn't ours to do.
   - Miscategorized → `--node-path <leaf-id>` (comma-separated for multiple leaves). This
     **moves** the lecture: it's removed from every node it currently appears in (a cross-listed
     shiur can live in more than one — the script finds and updates all copies by id) and
     inserted fresh into the node(s) you specify. If you're not sure of the right category, run
     `categorize-shiur.mjs` the same way as in the add flow and apply the same
     confirm-if-low-confidence rule.
   - Add/replace the sources PDF → `--pdf-file "<path>"` or `--pdf-url "<url>"`. Same
     old-object-deletion rule as audio replacement: the previous PDF is deleted from R2 only if it
     was actually hosted there.
   - Remove the sources PDF entirely → `--remove-pdf` (deletes the R2 object if it was ours, and
     drops the field from every occurrence of the lecture).

   You can combine multiple fixes in one call (e.g. fix the title *and* move it) — pass every
   flag that changed.

3. **Dry-run first**, same as add mode:
   ```
   node scripts/add-or-fix-shiur.js --mode fix --dry-run --id <id> --title "Corrected title"
   ```
   The output's `changed` array confirms exactly what the script thinks it's touching, and
   `movedFrom`/`movedTo` (if applicable) show every node it will remove from and add to — check
   this matches what the user actually meant before proceeding, especially for cross-listed
   shiurim where `movedFrom` having more than one entry is easy to miss.

4. **Run for real** (drop `--dry-run`), then **commit and push to `main`** as in the add flow,
   with a commit message describing the fix (e.g. `fix shiur YBT-927564: correct title`).

## Reference

**ID scheme for new shiurim** (decided when this skill was built): a YUTorah-sourced add uses
`YBT-<shiurid>`; anything added from a local file or generic URL gets the next `MISC-<NN>` id
(scans the whole tree for the highest existing `MISC-` number and increments,
zero-padded to 2 digits) unless you pass `--id` explicitly. Never invent an id yourself — let the
script assign it, so numbering stays consistent across separate runs of this skill.

**YUTorah id/org lookup.** `classic.yutorah.org`'s search API defaults to one specific
organization if you don't pass `organizationID` explicitly, so a shiur id from a *different*
affiliate (YBT's own content on that platform included) can come back "not found" even though it
exists. The script already retries with the org id embedded in a `lecture_iframe.cfm` URL's
`Affiliate~CFM~<id>~` fragment when you pass `--yutorah-url`; if you only have a bare id and it's
not found, ask the user if they know which affiliate/org it's under, or ask them for the full
lecture page URL instead.

**R2 key convention.** Audio is uploaded to a key that mirrors the shiur's place in
`folder-hierarchy.json` (root-to-leaf node ids, e.g. `chumash/bereishit/bereishit-noach/<id>.mp3`),
per the user's request to keep new uploads discoverable in the bucket by category. A sources PDF
(if any) sits alongside it at the same path, e.g.
`chumash/bereishit/bereishit-noach/<id>-sources.pdf`. This differs from the live ingest pipelines'
flat/source-keyed convention (`ingest/<date>/`, `drive/<speaker>/`) — that's fine, both conventions
coexist in the same bucket.

**Every write is backed up first.** Both add and fix write a timestamped
`data/lectures.backup-<add|fix>-shiur-<ISO timestamp>.json` before touching the real file — if
anything goes wrong after the fact, that's your rollback (`cp` it back over `data/lectures.json`,
then re-run `node scripts/generate-node-data.mjs`).

**`--dry-run` is safe to run as many times as you want** — it does the real fetch/download/decode
work (so you see real durations and real fetched metadata) but skips the R2 upload/delete and
every filesystem write. Use it generously; only drop it once you and the user are confident.

**Don't skip the confirmation checkpoints** even in a hurry: a low-confidence categorization or a
dry-run result that looks off are exactly the moments the user asked to be looped in on when this
skill was designed — the cost of asking is one message, the cost of silently uploading a
mis-titled or miscategorized shiur to a live site is a user finding it later.
