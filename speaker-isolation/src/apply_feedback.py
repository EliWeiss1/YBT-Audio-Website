"""Step 5 — feed manual corrections back in to improve future accuracy.

After a batch, you listen to the flagged clips in output/review_queue/<file>/ and
mark each row's `label` column in that file's segments.csv:

    label = "true"   -> this clip IS the rabbi  (should have been kept)
    label = "false"  -> this clip is NOT the rabbi (should have been cut)
    (leave blank for clips you didn't check)

Then run one (or both) of:

  --tune     Analyze labeled similarities and suggest better keep_high / cut_low
             thresholds. Add --write to apply them to config.yaml.
  --promote  Copy the well-verified "true" clips into reference_samples/<slug>/
             as extra hard examples and rebuild that rabbi's profile.

    python src/apply_feedback.py --tune
    python src/apply_feedback.py --tune --write
    python src/apply_feedback.py --promote
    python src/apply_feedback.py --tune --promote --file BN-9293
"""
from __future__ import annotations

import argparse
import csv
import shutil
from pathlib import Path

import numpy as np

from common import REVIEW_QUEUE_DIR, MANIFEST_PATH, ROOT, load_config
import build_reference_profile as brp


def _file_to_slug() -> dict[str, str]:
    """Map manifest 'file' -> 'speaker_slug' (last row wins)."""
    m = {}
    if MANIFEST_PATH.exists():
        with open(MANIFEST_PATH, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                if r.get("file") and r.get("speaker_slug"):
                    m[r["file"]] = r["speaker_slug"]
    return m


def collect_labeled(only_file: str | None = None) -> list[dict]:
    """Read every review_queue/<file>/segments.csv and return labeled rows."""
    slugs = _file_to_slug()
    rows = []
    for seg_csv in sorted(REVIEW_QUEUE_DIR.glob("*/segments.csv")):
        file = seg_csv.parent.name
        if only_file and file != only_file:
            continue
        with open(seg_csv, newline="", encoding="utf-8") as f:
            for r in csv.DictReader(f):
                label = (r.get("label") or "").strip().lower()
                if label not in ("true", "false"):
                    continue
                sim = r.get("similarity")
                rows.append({
                    "file": file,
                    "slug": slugs.get(file, ""),
                    "kind": r.get("kind"),
                    "similarity": float(sim) if sim not in (None, "") else None,
                    "clip": (seg_csv.parent / r["clip"]) if r.get("clip") else None,
                    "label": label,
                })
    return rows


def tune(rows: list[dict], write: bool) -> None:
    sims_true = [r["similarity"] for r in rows if r["label"] == "true" and r["similarity"] is not None]
    sims_false = [r["similarity"] for r in rows if r["label"] == "false" and r["similarity"] is not None]
    cfg = load_config()
    cur = cfg["thresholds"]

    print(f"\n=== Threshold tuning ===  (labeled: {len(sims_true)} true, {len(sims_false)} false)")
    if not sims_true or not sims_false:
        print("Need at least one 'true' AND one 'false' labeled clip with a similarity.")
        return

    min_true, max_false = min(sims_true), max(sims_false)
    overlap = sum(1 for s in sims_false if s >= min_true)
    print(f"  true sims : min={min_true:.3f} mean={np.mean(sims_true):.3f} max={max(sims_true):.3f}")
    print(f"  false sims: min={min(sims_false):.3f} mean={np.mean(sims_false):.3f} max={max_false:.3f}")

    new_cut_low = round(max(0.0, min_true - 0.02), 3)
    new_keep_high = round(max_false + 0.02, 3)
    if new_keep_high <= new_cut_low:
        # Poor separation — trues and falses overlap. Widen the review band and
        # recommend improving the profile instead of trusting thresholds.
        mid = round((min_true + max_false) / 2, 3)
        new_cut_low, new_keep_high = round(mid - 0.05, 3), round(mid + 0.05, 3)
        print(f"  WARNING: {overlap} false clip(s) score >= the lowest true clip. "
              "Separation is weak — prefer --promote to strengthen the profile.")

    print(f"\n  keep_high: {cur['keep_high']}  ->  {new_keep_high}")
    print(f"  cut_low  : {cur['cut_low']}  ->  {new_cut_low}")

    if write:
        _patch_config_thresholds(new_keep_high, new_cut_low)
        print("\n  config.yaml updated. Re-run affected files to apply.")
    else:
        print("\n  (dry run — add --write to apply these to config.yaml)")


def _patch_config_thresholds(keep_high: float, cut_low: float) -> None:
    """Rewrite the two threshold lines in config.yaml, preserving comments."""
    cfg_path = ROOT / "config.yaml"
    lines = cfg_path.read_text(encoding="utf-8").splitlines(keepends=True)
    out, in_th = [], False
    for ln in lines:
        stripped = ln.strip()
        if stripped.startswith("thresholds:"):
            in_th = True
        elif in_th and stripped and not ln[:1].isspace():
            in_th = False  # left the thresholds block
        if in_th and stripped.startswith("keep_high:"):
            ln = ln[:ln.index("keep_high:")] + f"keep_high: {keep_high}\n"
        elif in_th and stripped.startswith("cut_low:"):
            ln = ln[:ln.index("cut_low:")] + f"cut_low: {cut_low}\n"
        out.append(ln)
    cfg_path.write_text("".join(out), encoding="utf-8")


def promote(rows: list[dict]) -> None:
    """Copy verified 'true' clips into reference_samples/<slug>/ and rebuild profiles."""
    promoted_slugs = set()
    n = 0
    for r in rows:
        if r["label"] != "true" or not r["clip"] or not r["slug"]:
            continue
        clip = Path(r["clip"])
        if not clip.exists():
            continue
        dest_dir = ROOT / "reference_samples" / r["slug"]
        dest_dir.mkdir(parents=True, exist_ok=True)
        dest = dest_dir / f"verified_{r['file']}_{clip.stem}.mp3"
        if not dest.exists():
            shutil.copy2(clip, dest)
            n += 1
        promoted_slugs.add(r["slug"])

    print(f"\n=== Promote ===  copied {n} verified clip(s) into reference_samples/")
    for slug in sorted(promoted_slugs):
        print(f"\n[promote] rebuilding profile for {slug} ...")
        brp.build(slug)
    if not promoted_slugs:
        print("  No 'true'-labeled clips with a known slug to promote.")


def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--tune", action="store_true", help="Suggest new thresholds from labels.")
    ap.add_argument("--write", action="store_true", help="With --tune, write to config.yaml.")
    ap.add_argument("--promote", action="store_true",
                    help="Add verified 'true' clips to the profile(s) and rebuild.")
    ap.add_argument("--file", help="Only use one file's segments.csv (by manifest 'file').")
    args = ap.parse_args()

    if not (args.tune or args.promote):
        ap.error("Choose --tune and/or --promote.")

    rows = collect_labeled(args.file)
    if not rows:
        print("No labeled rows found. Edit the 'label' column in "
              "output/review_queue/<file>/segments.csv first.")
        return 1

    if args.tune:
        tune(rows, args.write)
    if args.promote:
        promote(rows)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
