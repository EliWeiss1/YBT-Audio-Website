"""Build (or refresh) a per-rabbi voice profile from clean reference clips.

A profile is a single averaged ECAPA embedding for one rabbi, saved once and
reused across all future runs. Sources (either or both):

  * manual clips in  reference_samples/<slug>/*.{mp3,wav,m4a,mp4}
  * --ids id1,id2,... : trusted CLEAN solo lectures pulled from the site catalog

Prints pairwise cosine similarity between the individual samples so a mislabeled
or noisy "reference" is caught early (a sample that doesn't match the others).

    python src/build_reference_profile.py <slug> [--ids ID1,ID2] [--min-pair 0.6]
    python src/build_reference_profile.py --list-speakers "schneeweiss"
"""
from __future__ import annotations

import argparse
import pickle
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import soundfile as sf

from common import (PROFILES_DIR, ensure_dirs, require_ffmpeg, decode_to_wav,
                    embed_windows, cosine, slugify_speaker, ROOT, load_config)
import fetch_lectures

AUDIO_EXTS = {".mp3", ".wav", ".m4a", ".mp4", ".flac", ".ogg"}


def profile_path(slug: str) -> Path:
    return PROFILES_DIR / f"{slug}.pkl"


def load_profile(slug: str) -> dict:
    with open(profile_path(slug), "rb") as f:
        return pickle.load(f)


def _embed_file(src: Path, tmpdir: Path) -> np.ndarray | None:
    """Decode a clip to 16k mono wav and return its (windowed-average) embedding."""
    wav = decode_to_wav(src, tmpdir / (src.stem + ".wav"), sr=16000)
    samples, sr = sf.read(str(wav), dtype="float32")
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    return embed_windows(samples, sr)


def _gather_sources(slug: str, ids: list[str], tmpdir: Path) -> list[tuple[str, Path]]:
    """Return (label, path) pairs for every reference clip to embed."""
    sources: list[tuple[str, Path]] = []

    ref_dir = ROOT / "reference_samples" / slug
    if ref_dir.is_dir():
        for p in sorted(ref_dir.iterdir()):
            if p.suffix.lower() in AUDIO_EXTS:
                sources.append((f"manual:{p.name}", p))

    for lid in ids:
        dl = fetch_lectures.download_lecture(lid, tmpdir)
        sources.append((f"site:{lid}", dl))

    return sources


def build(slug: str, ids: list[str] | None = None, min_pair: float = 0.6) -> dict:
    ensure_dirs()
    require_ffmpeg()
    ids = ids or []

    with tempfile.TemporaryDirectory() as td:
        tmpdir = Path(td)
        sources = _gather_sources(slug, ids, tmpdir)
        if not sources:
            raise SystemExit(
                f"No reference clips for '{slug}'. Add files to "
                f"reference_samples/{slug}/ and/or pass --ids.")

        labels, embs = [], []
        for label, p in sources:
            print(f"[profile] embedding {label} ...", file=sys.stderr)
            e = _embed_file(p, tmpdir)
            if e is None:
                print(f"[profile]   skipped (too short/empty): {label}", file=sys.stderr)
                continue
            labels.append(label)
            embs.append(e)

    if not embs:
        raise SystemExit("No usable reference embeddings were produced.")

    mat = np.stack(embs, axis=0)
    mean = mat.mean(axis=0).astype(np.float32)

    # Pairwise similarity sanity check.
    print("\n=== Pairwise cosine similarity between reference samples ===")
    n = len(embs)
    low_pairs = []
    if n == 1:
        print("  (only one sample — cannot cross-check; add more for a robust profile)")
    for i in range(n):
        for j in range(i + 1, n):
            c = cosine(embs[i], embs[j])
            flag = "  <-- LOW, check this sample" if c < min_pair else ""
            print(f"  {labels[i]:>24}  vs  {labels[j]:<24}  {c:+.3f}{flag}")
            if c < min_pair:
                low_pairs.append((labels[i], labels[j], c))
    if low_pairs:
        print(f"\n[profile] WARNING: {len(low_pairs)} pair(s) below {min_pair:.2f} — "
              "one of your 'reference' clips may be mislabeled or noisy.")

    profile = {
        "slug": slug,
        "mean": mean,
        "embeddings": mat,
        "labels": labels,
        "n_samples": n,
        "created": datetime.now(timezone.utc).isoformat(),
        "embedding_model": load_config()["models"]["embedding"],
    }
    with open(profile_path(slug), "wb") as f:
        pickle.dump(profile, f)
    print(f"\n[profile] saved {profile_path(slug)}  ({n} samples)")
    return profile


def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("slug", nargs="?", help="Rabbi slug, e.g. rabbi-matt-schneeweiss")
    ap.add_argument("--ids", help="Comma-separated trusted-clean lecture IDs to bootstrap from.")
    ap.add_argument("--min-pair", type=float, default=0.6,
                    help="Warn when a pairwise similarity falls below this (default 0.6).")
    ap.add_argument("--list-speakers", metavar="QUERY",
                    help="List site speakers matching QUERY and their derived slugs, then exit.")
    args = ap.parse_args()

    if args.list_speakers:
        matches = fetch_lectures.find_by_speaker(args.list_speakers)
        for s in sorted({m["speaker"] for m in matches}):
            print(f"{slugify_speaker(s):<32} {s!r}")
        return 0

    if not args.slug:
        ap.print_help()
        return 1

    ids = [x.strip() for x in args.ids.split(",")] if args.ids else []
    build(args.slug, ids, args.min_pair)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
