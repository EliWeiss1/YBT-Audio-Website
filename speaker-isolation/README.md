# Speaker Isolation Pipeline

Takes shiur recordings (a rabbi close to the mic + students speaking further away)
and produces cleaned audio containing **only the rabbi's voice**, with student
speech cut. Scales from a few test files to ~1000, with automated QA so you don't
have to listen to every output.

Design bias: **never lose the Rabbi.** Only segments the tool is *confident* are
**not** the rabbi get cut; anything uncertain is kept, with a safety pad around
every boundary. Tune from there.

This is a standalone tool at the repo root (outside `shiurim-app/`, so it never
touches the Next.js/Vercel build). It reads the site catalog
(`shiurim-app/data/lectures.json`) read-only to resolve lecture IDs to audio.

---

## How it works

```
reference clips ──► build_reference_profile.py ──► profiles/<rabbi>.pkl  (once per rabbi)

recording ──► process_single_file.py:
   decode/trim ─► pyannote diarization ─► per-turn ECAPA embedding
   ─► cosine vs profile ─► KEEP / REVIEW / CUT
   ─► rebuild audio (keep + review, padded, crossfaded) ─► output/cleaned/
   ─► review clips + segments.csv ─► output/review_queue/<file>/
   ─► faster-whisper transcript ─► output/transcripts/
   ─► metrics row ─► logs/manifest.csv

many recordings ──► batch_process.py (resumable) ──► qa_report.py (risk-ranked shortlist)
corrections ──► apply_feedback.py (--tune thresholds / --promote profile)
```

Per-segment decision (cosine similarity to the rabbi's profile):

| similarity          | class  | in output? |
|---------------------|--------|------------|
| `>= keep_high`      | KEEP   | yes        |
| `cut_low .. keep_high` | REVIEW | yes (bias-to-keep; configurable) |
| `< cut_low`         | CUT    | no         |
| too short to embed  | REVIEW | yes        |

---

## 1. Setup

**Python + venv** (from this `speaker-isolation/` folder):

```bash
python -m venv venv
venv\Scripts\activate            # Windows PowerShell/cmd
# source venv/bin/activate       # macOS/Linux
pip install -r requirements.txt
```

**ffmpeg** must be on your PATH (same assumption as the rest of the repo):

```bash
ffmpeg -version                  # verify
# Windows install if missing:
winget install Gyan.FFmpeg       # or:  choco install ffmpeg
```

**HuggingFace token** (pyannote diarization is a *gated* model):

1. Create a token at <https://huggingface.co/settings/tokens> (read scope).
2. Accept the model terms (click "Agree") on **both**:
   - <https://huggingface.co/pyannote/speaker-diarization-3.1>
   - <https://huggingface.co/pyannote/segmentation-3.0>
3. Set it as an **environment variable** — never paste it into a committed file:

   ```powershell
   # PowerShell (current session)
   $env:HF_TOKEN = "hf_xxx"
   # persist for your user:
   setx HF_TOKEN "hf_xxx"
   ```
   ```bash
   export HF_TOKEN=hf_xxx        # macOS/Linux
   ```

**Compute:** `config.yaml` defaults to `device: cpu` (correct for the Intel Arc
laptop — pyannote/torch have no CUDA here). CPU is slow: expect several minutes
per ~1h file; run big batches overnight. Intel Arc/XPU is experimental and off by
default.

---

## 2. Build a rabbi's voice profile (once per rabbi)

Find the exact slug the tool derives for a site speaker:

```bash
python src/build_reference_profile.py --list-speakers "schneeweiss"
# rabbi-matt-schneeweiss   'Rabbi Matt Schneeweiss'
```

Build the profile from trusted **clean solo** lectures (bootstrap from the site),
and/or from manual clips in `reference_samples/<slug>/`:

```bash
python src/build_reference_profile.py rabbi-matt-schneeweiss --ids YBT-123,YBT-456
```

It prints **pairwise cosine similarity** between your reference samples — if one
pair is much lower than the rest, that "reference" is probably mislabeled/noisy;
remove it and rebuild. Output: `profiles/rabbi-matt-schneeweiss.pkl` (reused
forever; rebuild only to improve it).

---

## 3. Run a single file

By site lecture id (speaker inferred from catalog metadata):

```bash
python src/process_single_file.py YBT-123
```

A local file (you must name the profile), optionally only part of it:

```bash
python src/process_single_file.py input/shiur.mp3 --speaker rabbi-matt-schneeweiss
python src/process_single_file.py input/shiur.mp3 --speaker rabbi-matt-schneeweiss --start 120 --end 900
```

Outputs: `output/cleaned/<file>.mp3`, `output/transcripts/<file>.txt`,
`output/review_queue/<file>/` (uncertain/cut clips + `segments.csv`), and a row
in `logs/manifest.csv`.

---

## 4. Run a batch (resumable)

```bash
python src/batch_process.py --input input/ --speaker rabbi-matt-schneeweiss
python src/batch_process.py --ids my_ids.txt
python src/batch_process.py --speaker "schneeweiss"     # every site lecture for that speaker
```

- **Resumable:** files already `ok` in `manifest.csv` are skipped; re-run after an
  interruption and it continues. `--force` re-processes everything.
- **Fault-tolerant:** one file's failure is logged (`status=error`) and the batch
  keeps going.
- **Scales unchanged** from 20 → 100 → 1000 files — just point at a bigger input
  or id list.

---

## 5. QA — what to actually listen to

```bash
python src/qa_report.py --top 20
```

Ranks files by a **risk score** (statistical outliers on kept %, cut %, turn
count, avg keep-length via z-score vs the batch; oversized review queues; low
review confidence; transcript red flags like long silences). Read the top of the
list instead of every file. Errored files are listed separately.

### `manifest.csv` columns

| column | meaning |
|---|---|
| `kept_pct` / `cut_pct` | % of the (region) audio kept vs removed |
| `n_turns` | diarized speaker turns |
| `keep_seg_avg/min/max_s` | kept-segment length stats |
| `n_keep` / `n_review` / `n_cut` | segment counts by class |
| `review_avg_conf` | mean similarity of REVIEW segments |
| `outlier_flags` | populated by the QA report |
| `status` / `error` | `ok` or `error` (+ message) |

A very **low `kept_pct`** or very **high `n_turns`** usually means the profile is
weak or thresholds are too aggressive — check that file first.

---

## 6. Feedback loop (repeat after each batch)

1. Open a flagged file's `output/review_queue/<file>/segments.csv`. Listen to the
   `review_*`/`cut_*` clips in that folder.
2. Fill the **`label`** column: `true` if the clip **is** the rabbi (should be
   kept), `false` if it's **not** (should be cut). Leave blank if unchecked.
3. Feed it back:

   ```bash
   python src/apply_feedback.py --tune           # suggest better thresholds (dry run)
   python src/apply_feedback.py --tune --write   # apply them to config.yaml
   python src/apply_feedback.py --promote        # add verified 'true' clips to the profile, rebuild
   ```

   - **`--tune`** picks `keep_high`/`cut_low` that separate your labeled true/false
     similarities. If they overlap (weak separation), it warns you to `--promote`.
   - **`--promote`** copies verified `true` clips into `reference_samples/<slug>/`
     as hard examples and rebuilds that rabbi's profile — the most durable fix.
4. Re-run the affected files (`--force`) and re-check `qa_report.py`.

---

## Suggested first-run walkthrough

1. Setup (§1), verify `ffmpeg -version` and `HF_TOKEN`.
2. Build one rabbi's profile from 2–3 clean IDs; eyeball the pairwise-similarity check.
3. Process 2–3 recordings you know contain student Q&A (use `--start/--end` to
   target just the relevant stretch). Listen to `output/cleaned/`, skim the
   transcript, spot-check the `review_queue/` clips.
4. Adjust `keep_high` / `cut_low` in `config.yaml` and re-run those files with
   `--force` until the cuts look right.
5. Scale up: `batch_process.py` on 20, interrupt/resume to confirm, then 100 /
   1000 overnight; triage with `qa_report.py`.

---

## Layout

```
speaker-isolation/
  config.yaml            all tunables (thresholds, pad, crossfade, models, device)
  requirements.txt
  reference_samples/<slug>/   manual clean clips (gitignored audio)
  input/                 recordings to clean / _site_cache/ downloads
  profiles/<slug>.pkl    built voice profiles (committed)
  output/{cleaned,transcripts,review_queue}/
  logs/manifest.csv
  src/{common,fetch_lectures,build_reference_profile,
       process_single_file,batch_process,qa_report,apply_feedback}.py
```

## Notes / gotchas

- **Windows + SpeechBrain symlinks:** SpeechBrain may warn about symlink perms.
  It falls back to copying; if it errors, enable Developer Mode (Settings →
  Privacy & security → For developers) or run once from an elevated shell.
- **Dead/404 audio:** some legacy `ybt.org` URLs 404 (a known site issue). Those
  files log as `error` in the manifest and the batch continues.
- **Not wired into ingestion** yet — this is an offline tool by design; the
  `process()` function is import-friendly if you later call it from a pipeline.
```
