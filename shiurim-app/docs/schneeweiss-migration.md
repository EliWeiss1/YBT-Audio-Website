# Rabbi Matt Schneeweiss YUTorah → YBT Migration — Plan & Handoff

Self-contained context so this work can continue in a fresh chat. Covers what's
done (5-shiur pilot), how the system actually works, and the path to (a) a
1-shiur **real** end-to-end ingest and (b) the full ~804-shiur run.

---

## 1. Status

- **Pilot (5-shiur dry run): DONE.** Scrape + categorize + download + MP4→MP3
  convert, local output only (no R2 upload, no DB write). Outputs in
  `scripts/pilot-output/`: `pilot-output.json`, `pilot-report.md`,
  `checkpoint.json`, `pilot-media/*.mp3`.
- **also done:** one shiur **real** end-to-end (upload to R2 + write into the site +
  deploy)
- **Next :** the full run.

Pilot scripts (all plain Node, no Claude needed to run):
- `scripts/pilot-scrape.js` — Phase 1+2 (fetch metadata + categorize) → `_scrape-cache.json`, `checkpoint.json`
- `scripts/pilot-download.js` — Phase 4+5 (download + ffmpeg convert + ffprobe validate) → `_media-cache.json`
- `scripts/pilot-finalize.js` — assembles `pilot-output.json` + `pilot-report.md`, applies the cross-listing decisions

---

## 2. How the data actually flows (verified)

### Data source — DO NOT use Playwright
`https://www.yutorah.org/lectures/lecture.cfm/{id}` is behind a Cloudflare
**managed** bot challenge — 403 to server `fetch` AND to Playwright (headless and
headed, even with anti-automation flags + reload). Use the **search API** instead:

```
https://classic.yutorah.org/search/_get_search_results.cfm?search_query={shiurID}&page=1
```

Plain `fetch` → 200 JSON. Per-doc fields: `shiurid, shiurtitle, shiurdate,
duration` (MINUTES), `shiurdescription, categoryname[], subcategoryname[],
teacherfullname, teacherid, shiururl, mediatypename`. Filter `response.docs` by
exact `shiurid`. (Rabbi Schneeweiss `teacherid = 83858`.)

To **enumerate all** his shiurim for the full run: page the same API with
`search_query=` filtered by teacher (e.g. `facet_query=teacherid:83858`) or use
the teacher search; paginate `page=1..N` (PAGE_SIZE 30) until `numFound` exhausted.
(The pilot hard-codes 5 IDs; the full run needs this enumeration step.)

### Download URL
`https://download.yutorah.org{shiururl}`, observed pattern
`/{YEAR}/248687/{shiurID}.{EXT}` where:
- `248687` = teacher **download folder** (holds for all of his shiurim) — NOT the API `teacherid` 83858.
- `YEAR` = the shiur's calendar year.
- `download.yutorah.org` **302-redirects to a Cloudflare R2 bucket** (`pub-118b5aaf…r2.dev`). `fetch(..., {redirect:'follow'})` handles it.
- MP4 (video) needs `ffmpeg -vn -acodec libmp3lame -q:a 3`; some are already MP3 (no convert). ffprobe both, require drift ≤5s.

### Two ingest mechanisms (pick the right one)
1. **Live email/Zoom ingest** (`lib/ingest/*` + `app/api/ingest-shiur`):
   categorize → R2 upload → Supabase `pending_lectures` row → merged into the tree
   at build by `generate-node-data.mjs::mergePendingLectures`.
   **Limitations that make it WRONG for this migration:** `node_path` is only
   `[catId, nodeId]` and the merge resolves `nodeId` as a *direct child of a top
   category* — it **cannot target deep nodes** (e.g. `kisvei-rishonim-rambam-moreh-nevuchim`
   is a grandchild and would silently fall back to the top category), and it places
   into **one** node only (no cross-listing).
2. **Bulk scraper into `data/lectures.json`** (`scripts/yutorah-scraper.js` pattern):
   edits the source-of-truth JSON directly — supports **arbitrary depth** and
   **multiple placements**. **This is the correct mechanism for the migration.**

`data/lectures.json` (≈9.4 MB) is the source of truth. `npm run generate-node-data`
(also runs on `dev`/`build`) splits it into `public/lectures-data/`. Deploy = commit
+ Vercel build (which runs generate-node-data). R2 creds + Supabase service key are
in `.env.local`; bucket `shiurim-audio`, public `https://pub-f7e468cb…r2.dev`.

### Cross-listing (one shiur in multiple folders) — supported & safe
Insert the **identical lecture object (same `id`)** into each target node's
`lectures[]`. Verified safe:
- `generate-node-data.mjs` writes one `{nodeId}.json` per node → appears on each page.
- `catalog.json` (search) dedupes by id ("first occurrence wins" in traversal order)
  → search shows it once, no React-key collisions, speaker counts not doubled.
- `scripts/fix-duplicate-ids.js` dedupes only **within a node** (fresh seen-set per
  node) → won't clobber cross-listed copies in different nodes.
- **Caveat:** the search breadcrumb shows the *first* node reached in traversal
  (categories array order, depth-first, lectures-before-children), which may differ
  from the intended primary. Cosmetic only.

### nodeId resolution
Always match the real `id` field in `data/folder-hierarchy.json`; never construct
slugs. Chumash parsha ids drop the `chumash-` prefix (e.g. `bamidbar-chukat`, not
`chumash-bamidbar-chukat`). The production `CATEGORY_MAP` in
`scripts/yutorah-scraper.js` is a complete, validated `Namespace|Value → nodeId`
map for the whole hierarchy — reuse it.

---

## 3. Pilot decisions (locked)

| shiurID | title | tags | primary node | cross-listed placements |
|---|---|---|---|---|
| 1179161 | Mishlei 25:28… | `Nach: Mishlei` | `nach-mishlei` | — |
| 1179108 | Tehilim 93… | `Nach: Tehillim` | `nach-tehillim` | — |
| 1151186 | Q&A #45 — Olam ha'Ba… | `Halacha: Yom Kippur`, `Machshava: Torah`, `Machshava: Olam Habah` | `discussion-qa` | `holidays-rosh-hashana-yom-kippur`, `discussion-olam-haba` |
| 1180731 | Chukas… | `Parsha: Chukat` | `bamidbar-chukat` | — |
| 1178688 | Rambam … Moreh 3:17b-18 | `Machshava: Rambam`, `Nach: Iyov` | `kisvei-rishonim-rambam-moreh-nevuchim` | `nach-iyov` |

Rules:
- Any **"Q&A"** in the title → primary `discussion-qa`, then cross-list to each topic node.
- A **Rishonim/Moreh** signal should outrank the Nach tag (1178688).
- `Machshava: Torah` → `discussion-learning-chachma` is **intentionally ignored** (per user).
- `id` scheme = `YBT-{shiurID}` (matches the existing scraper convention). `audioUrl`
  is null in the dry run; assigned at ingest = the R2 public URL.
- Tag pairing must be **index-aligned** `categoryname[i]`↔`subcategoryname[i]`. The
  production scraper's all-pairs loop is a latent bug — fix for the full run.

---

## 4. Generalization gaps before the full run

The pilot categorizer is a framework, NOT yet production-general. To generalize:
1. **Resolution map:** replace the pilot's partial holiday/discussion/rishonim maps
   with the complete `CATEGORY_MAP` from `yutorah-scraper.js` (covers all branches).
2. **Rule fixes (from the pilot):** (a) `"Q&A"` title → `discussion-qa`;
   (b) Rishonim/Moreh keyword outranks Nach; (c) demote the holiday rule so an
   incidental holiday-named *Halacha* tag doesn't beat real topical content;
   (d) index-aligned tag pairing.
3. **Cross-listing generally:** emit a `placements[]` per shiur (multi-topic shiurim
   are common), not a single node.
4. **Enumeration:** add the teacher-paging step to fetch all ~804 IDs.
5. **Flag-for-review output:** auto-flag low-confidence / multi-namespace / no-match
   shiurim to a review list so only the ambiguous tail needs human/LLM attention.

---

## 5. Does the pipeline need Claude / tokens?

- **Mechanical pipeline (fetch → download → convert → R2 upload → write lectures.json
  → generate-node-data → deploy): pure Node + ffmpeg. Runs on your terminal. No
  Claude, no tokens. Deterministic, resumable via `checkpoint.json`.** This is the
  *more* reliable path for everything except categorization.
- **Categorization is the only judgment step.** Options:
  - Deterministic (`CATEGORY_MAP` + rules): token-free, terminal-only, but a tail of
    ambiguous/multi-tag shiurim get mis-binned (as the 2 pilot conflicts showed).
  - LLM categorizer (`lib/ingest/categorizer.ts`, uses `ANTHROPIC_API_KEY`): costs
    **Anthropic API** tokens (not Claude Code), ~804 calls; better on nuance.
  - **Recommended hybrid:** deterministic by default, auto-flag the ambiguous minority
    for a review pass. Bulk runs token-free; only flagged ones cost anything.

---

## 6. Next step — ONE shiur, real end-to-end into the site

Goal: pick 1 shiur, actually publish it so it's live on the site. Steps (to be
scripted as e.g. `scripts/ingest-one.js`):
1. Fetch metadata via search API; download media; convert to MP3 (reuse pilot logic).
2. **Upload MP3 to R2** (reuse `lib/ingest/r2-uploader.ts` style or `migrate-to-r2.js`
   S3 client). Key scheme: decide a folder, e.g. `Schneeweiss/{shiurID}.mp3`. Public
   URL = `${R2_PUBLIC_URL}/{encodedKey}`. Set `INGEST_DRY_RUN=false` to actually upload.
3. **Insert the lecture object** (with `audioUrl` = R2 URL) into the target node(s) in
   `data/lectures.json` — cross-list into each placement node. (Direct-JSON path, not
   `pending_lectures`, so deep nodes + cross-listing work.)
4. `npm run generate-node-data` → verify `public/lectures-data/{nodeId}.json` and
   `catalog.json` contain it; optionally `npm run dev` and eyeball the browse page +
   search + audio playback.
5. Commit `data/lectures.json` + push (or trigger `VERCEL_DEPLOY_HOOK_URL`) → live.

**Open decisions for the 1-shiur test:** which shiur ID; the R2 key/folder scheme;
whether to back up `data/lectures.json` first (recommended — the scraper writes a
`.backup.json`). Nothing is committed/uploaded until you say go.

---

## 7. Pointers
- Pilot artifacts: `scripts/pilot-output/`
- Hierarchy: `data/folder-hierarchy.json` · Schema sample: `data/sample-lectures.json`
- Full category map + bulk pattern: `scripts/yutorah-scraper.js`
- Build splitter: `scripts/generate-node-data.mjs` · Live ingest: `lib/ingest/*`, `app/api/ingest-shiur`
- R2 upload reference: `scripts/migrate-to-r2.js`, `lib/ingest/r2-uploader.ts`
