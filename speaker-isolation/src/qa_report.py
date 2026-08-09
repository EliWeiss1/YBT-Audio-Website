"""Batch QA summary — flag the files most likely to have errors, so you read/
listen to a prioritized shortlist instead of every output.

Reads logs/manifest.csv, computes z-scores of key metrics against the batch
mean, and ranks files by a simple risk score built from: statistical outliers
(kept %, cut %, avg keep-segment length, turn count), oversized review queues,
low average review confidence, and transcript red flags (very long silences /
suspiciously short output). Also lists any files that errored out.

    python src/qa_report.py            # summarize the whole manifest
    python src/qa_report.py --top 15   # show the 15 riskiest files
"""
from __future__ import annotations

import argparse
import re
from pathlib import Path

import numpy as np
import pandas as pd

from common import MANIFEST_PATH, load_config


NUMERIC = ["kept_pct", "cut_pct", "n_turns", "keep_seg_avg_s", "n_review"]


def _zscores(df: pd.DataFrame, col: str) -> pd.Series:
    x = pd.to_numeric(df[col], errors="coerce")
    mu, sd = x.mean(), x.std(ddof=0)
    if not sd or np.isnan(sd):
        return pd.Series(0.0, index=df.index)
    return (x - mu) / sd


def _transcript_flags(path: str) -> list[str]:
    flags = []
    if not path:
        return ["no-transcript"]
    p = Path(path)
    if not p.exists():
        return []
    lines = p.read_text(encoding="utf-8", errors="ignore").splitlines()
    if len(lines) < 2:
        flags.append("near-empty-transcript")
    # Long silence = a big jump between one line's end and the next line's start.
    prev_end = None
    for ln in lines:
        m = re.match(r"\[\s*([\d.]+)-\s*([\d.]+)\]", ln)
        if not m:
            continue
        s, e = float(m.group(1)), float(m.group(2))
        if prev_end is not None and (s - prev_end) > 8.0:
            flags.append("long-silence>8s")
            break
        prev_end = e
    return flags


def report(top: int) -> int:
    if not MANIFEST_PATH.exists():
        print("No manifest yet — process some files first.")
        return 1
    df = pd.read_csv(MANIFEST_PATH)
    # Keep the last row per file (a retried file may have an earlier error row).
    df = df.drop_duplicates(subset="file", keep="last").reset_index(drop=True)

    errors = df[df["status"] == "error"]
    ok = df[df["status"] == "ok"].copy()

    print(f"=== QA report — {len(df)} files ({len(ok)} ok, {len(errors)} errored) ===\n")
    if not errors.empty:
        print("Errored files (fix these):")
        for _, r in errors.iterrows():
            print(f"  {r['file']}: {str(r.get('error',''))[:120]}")
        print()

    if ok.empty:
        return 0

    cfg = load_config()["qa"]
    zthr = cfg["outlier_zscore"]

    # Risk score = sum of |z| over outlier metrics + review-queue + transcript flags.
    z = {c: _zscores(ok, c) for c in NUMERIC}
    risk = pd.Series(0.0, index=ok.index)
    flags = {i: [] for i in ok.index}
    for c in NUMERIC:
        for i in ok.index:
            if abs(z[c][i]) >= zthr:
                risk[i] += abs(z[c][i])
                flags[i].append(f"{c}~z{z[c][i]:+.1f}")

    n_turns = pd.to_numeric(ok["n_turns"], errors="coerce").replace(0, np.nan)
    review_pct = pd.to_numeric(ok["n_review"], errors="coerce") / n_turns
    for i in ok.index:
        if review_pct.get(i, 0) and review_pct[i] >= cfg["review_pct_flag"]:
            risk[i] += 1.0 + review_pct[i]
            flags[i].append(f"review={review_pct[i]*100:.0f}%")
        conf = pd.to_numeric(pd.Series([ok.at[i, "review_avg_conf"]]), errors="coerce").iloc[0]
        if not np.isnan(conf) and conf < load_config()["thresholds"]["cut_low"] + 0.05:
            risk[i] += 0.5
            flags[i].append(f"low-review-conf={conf:.2f}")
        for tf in _transcript_flags(str(ok.at[i, "transcript_path"])):
            risk[i] += 0.75
            flags[i].append(tf)

    ok["_risk"] = risk
    ok["_flags"] = [", ".join(flags[i]) or "-" for i in ok.index]
    ranked = ok.sort_values("_risk", ascending=False)

    print(f"Prioritized listen list (risk-ranked, z>={zthr}):\n")
    print(f"  {'risk':>5}  {'file':<28} {'kept%':>6} {'cut%':>6} {'rev':>4}  flags")
    for _, r in ranked.head(top).iterrows():
        print(f"  {r['_risk']:5.1f}  {str(r['file'])[:28]:<28} "
              f"{r['kept_pct']:>6} {r['cut_pct']:>6} {r['n_review']:>4}  {r['_flags']}")

    clean = (ranked["_risk"] == 0).sum()
    print(f"\n{clean} file(s) had no flags. Focus manual review on the top of the list above.")
    return 0


def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--top", type=int, default=20, help="How many riskiest files to show.")
    args = ap.parse_args()
    return report(args.top)


if __name__ == "__main__":
    raise SystemExit(_main())
