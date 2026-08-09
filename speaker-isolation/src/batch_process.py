"""Batch driver — process many recordings with resume + per-file error isolation.

Point it at any of:
  --input <dir>     every audio file in a folder (recursively)
  --ids <file>      a text file of site lecture ids (one per line; # comments ok)
  --speaker <sub>   every site lecture whose speaker name matches this substring

Resumable: files already recorded successfully in logs/manifest.csv are skipped,
so an interrupted overnight run picks up where it left off. A failure on one file
is logged (status=error) and the batch continues.

    python src/batch_process.py --input input/ --speaker rabbi-matt-schneeweiss
    python src/batch_process.py --ids my_ids.txt
    python src/batch_process.py --speaker "schneeweiss"
"""
from __future__ import annotations

import argparse
import sys
import traceback
from pathlib import Path

from common import (safe_stem, slugify_speaker, manifest_done_keys,
                    append_manifest_row, require_ffmpeg)
import fetch_lectures
import process_single_file as psf

AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".mp4", ".flac", ".ogg"}


def _collect_jobs(args) -> list[dict]:
    """Return a list of jobs: {ref, speaker, key}. `key` matches manifest 'file'."""
    jobs: list[dict] = []

    if args.input:
        root = Path(args.input)
        for p in sorted(root.rglob("*")):
            if p.is_file() and p.suffix.lower() in AUDIO_EXTS and "_site_cache" not in p.parts:
                jobs.append({"ref": str(p), "speaker": args.speaker,
                             "key": safe_stem(p.stem)})

    if args.ids:
        for line in Path(args.ids).read_text(encoding="utf-8").splitlines():
            lid = line.split("#", 1)[0].strip()
            if lid:
                jobs.append({"ref": lid, "speaker": args.speaker, "key": safe_stem(lid)})

    if args.speaker and not args.input and not args.ids:
        for lec in fetch_lectures.find_by_speaker(args.speaker):
            jobs.append({"ref": lec["id"], "speaker": args.speaker,
                         "key": safe_stem(lec["id"])})

    # De-dupe by key, preserving order.
    seen, unique = set(), []
    for j in jobs:
        if j["key"] not in seen:
            seen.add(j["key"])
            unique.append(j)
    return unique


def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--input", help="Folder of audio files to process (recursive).")
    ap.add_argument("--ids", help="Text file of site lecture ids (one per line).")
    ap.add_argument("--speaker", help="Rabbi slug/substring. Selects the profile, and "
                                      "(with no --input/--ids) selects site lectures.")
    ap.add_argument("--start", type=float, help="Trim start (s), applied to every file.")
    ap.add_argument("--end", type=float, help="Trim end (s), applied to every file.")
    ap.add_argument("--force", action="store_true", help="Re-process even if already done.")
    args = ap.parse_args()

    if not (args.input or args.ids or args.speaker):
        ap.error("Give at least one of --input, --ids, or --speaker.")

    require_ffmpeg()
    jobs = _collect_jobs(args)
    done = set() if args.force else manifest_done_keys()
    todo = [j for j in jobs if j["key"] not in done]

    print(f"[batch] {len(jobs)} job(s); {len(jobs) - len(todo)} already done; "
          f"{len(todo)} to process.")
    ok = fail = 0
    for n, j in enumerate(todo, 1):
        print(f"\n[batch] ({n}/{len(todo)}) {j['ref']}")
        try:
            psf.process(j["ref"], None, j["speaker"], args.start, args.end)
            ok += 1
        except SystemExit as e:            # config/user errors — record and continue
            _record_failure(j, str(e))
            fail += 1
        except Exception as e:
            traceback.print_exc()
            _record_failure(j, repr(e))
            fail += 1

    print(f"\n[batch] finished: {ok} ok, {fail} failed, "
          f"{len(jobs) - len(todo)} skipped.")
    return 0 if fail == 0 else 1


def _record_failure(job: dict, message: str) -> None:
    print(f"[batch] FAILED {job['ref']}: {message}", file=sys.stderr)
    append_manifest_row({
        "file": job["key"], "source": "batch",
        "speaker_slug": slugify_speaker(job.get("speaker") or ""),
        "status": "error", "error": message[:500],
    })


if __name__ == "__main__":
    raise SystemExit(_main())
