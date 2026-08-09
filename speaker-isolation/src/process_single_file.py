"""Process one recording: keep only the rabbi's voice, cut students.

Pipeline:
  1. Resolve input (local file OR site lecture id -> download) and speaker profile.
  2. Decode (optionally trim --start/--end) to 16k mono wav for analysis.
  3. Diarize with pyannote -> speaker-turn segments.
  4. Embed each turn (ECAPA) and cosine-compare to the rabbi's profile:
       >= keep_high -> KEEP, < cut_low -> CUT, else REVIEW.
  5. Build cleaned audio = KEEP (+ REVIEW, by config) with a safety pad around
     each boundary and a short crossfade at cuts. Bias-to-keep: only confident
     CUT segments are removed, so the Rabbi is never lost.
  6. Save REVIEW/CUT clips + a segments.csv to output/review_queue/<file>/.
  7. Transcribe the cleaned audio (faster-whisper) for a read-not-listen QA check.
  8. Append a metrics row to logs/manifest.csv.

    python src/process_single_file.py <input_audio_or_lectureId> [output_dir] \
        --speaker <rabbi-slug> [--start 120] [--end 900]
"""
from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import numpy as np
import soundfile as sf

import common
from common import (CLEANED_DIR, TRANSCRIPTS_DIR, REVIEW_QUEUE_DIR, ensure_dirs,
                    require_ffmpeg, decode_to_wav, embed_windows, cosine,
                    load_config, slugify_speaker, safe_stem, get_diarizer,
                    get_whisper, append_manifest_row)
import fetch_lectures
import build_reference_profile as brp


# --------------------------------------------------------------------------- #
# Interval helpers (all in milliseconds)
# --------------------------------------------------------------------------- #
def merge_intervals(intervals, pad_ms, min_len_ms, bound_ms):
    """Pad each interval by pad_ms on both sides, clamp to [0, bound], merge
    overlaps, then drop anything shorter than min_len_ms."""
    if not intervals:
        return []
    padded = sorted((max(0, s - pad_ms), min(bound_ms, e + pad_ms))
                    for s, e in intervals)
    merged = [list(padded[0])]
    for s, e in padded[1:]:
        if s <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], e)
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged if (e - s) >= min_len_ms]


# --------------------------------------------------------------------------- #
# Input resolution
# --------------------------------------------------------------------------- #
def _resolve_input(input_ref: str, speaker: str | None):
    """Return (audio_path, source, speaker_slug, base_name)."""
    p = Path(input_ref)
    if p.exists() and p.is_file():
        slug = slugify_speaker(speaker) if speaker else None
        return p, "local", slug, safe_stem(p.stem)

    # Treat as a lecture id.
    lec = fetch_lectures.get_lecture(input_ref)
    if lec is None:
        raise SystemExit(
            f"'{input_ref}' is neither an existing file nor a known lecture id.")
    audio = fetch_lectures.download_lecture(input_ref)
    slug = slugify_speaker(speaker) if speaker else lec.get("speaker_slug")
    return audio, "site", slug, safe_stem(input_ref)


# --------------------------------------------------------------------------- #
# Core
# --------------------------------------------------------------------------- #
def process(input_ref: str, output_dir: Path | None = None,
            speaker: str | None = None, start: float | None = None,
            end: float | None = None) -> dict:
    ensure_dirs()
    require_ffmpeg()
    cfg = load_config()
    out_cfg = cfg["output"]
    th = cfg["thresholds"]

    audio_path, source, slug, base = _resolve_input(input_ref, speaker)
    if not slug:
        raise SystemExit(
            "No speaker profile could be determined. Pass --speaker <slug> "
            "(local files carry no speaker metadata).")
    prof_path = brp.profile_path(slug)
    if not prof_path.exists():
        raise SystemExit(
            f"No profile for '{slug}' at {prof_path}. Build it first:\n"
            f"  python src/build_reference_profile.py {slug} --ids <clean IDs>")
    profile = brp.load_profile(slug)
    ref = profile["mean"]

    cleaned_dir = Path(output_dir) / "cleaned" if output_dir else CLEANED_DIR
    transcripts_dir = Path(output_dir) / "transcripts" if output_dir else TRANSCRIPTS_DIR
    review_root = Path(output_dir) / "review_queue" if output_dir else REVIEW_QUEUE_DIR
    for d in (cleaned_dir, transcripts_dir, review_root):
        d.mkdir(parents=True, exist_ok=True)
    review_dir = review_root / base
    review_dir.mkdir(parents=True, exist_ok=True)

    offset_ms = int((start or 0.0) * 1000)

    # 1) Decode/trim to 16k mono wav for analysis.
    work_wav = review_dir / "_analysis_16k.wav"
    decode_to_wav(audio_path, work_wav, sr=16000, start=start, end=end)
    samples, sr = sf.read(str(work_wav), dtype="float32")
    if samples.ndim > 1:
        samples = samples.mean(axis=1)
    region_s = len(samples) / sr
    bound_ms = int(region_s * 1000)

    # 2) Diarize.
    print(f"[process] diarizing {base} ({region_s/60:.1f} min) ...", file=sys.stderr)
    diar = get_diarizer()
    annotation = diar(str(work_wav))
    turns = sorted(((t.start, t.end) for t, _, _ in annotation.itertracks(yield_label=True)))

    # 3) Classify each turn.
    seg_rows = []            # dicts for segments.csv
    keep_intervals = []      # (start_ms, end_ms) in REGION time
    review_intervals = []
    review_sims = []
    from pydub import AudioSegment
    full_audio = AudioSegment.from_file(audio_path)

    def save_clip(kind, idx, s_ms, e_ms):
        seg = full_audio[offset_ms + s_ms: offset_ms + e_ms]
        clip = review_dir / f"{kind}_{idx:03d}.mp3"
        seg.export(clip, format="mp3", parameters=["-q:a", str(out_cfg["mp3_quality"])])
        return clip.name

    if not turns:
        # Bias-to-keep: no diarization result -> keep the whole region.
        print("[process] WARNING: diarization returned no turns; keeping whole region.",
              file=sys.stderr)
        keep_intervals.append((0, bound_ms))
    for i, (t0, t1) in enumerate(turns):
        s_ms, e_ms = int(t0 * 1000), int(t1 * 1000)
        chunk = samples[int(t0 * sr):int(t1 * sr)]
        emb = embed_windows(chunk, sr)
        if emb is None:
            sim = float("nan")
            kind = "review"            # too short to judge -> keep by default
        else:
            sim = cosine(emb, ref)
            if sim >= th["keep_high"]:
                kind = "keep"
            elif sim < th["cut_low"]:
                kind = "cut"
            else:
                kind = "review"
        if kind == "keep":
            keep_intervals.append((s_ms, e_ms))
        elif kind == "review":
            review_intervals.append((s_ms, e_ms))
            if not np.isnan(sim):
                review_sims.append(sim)

        clip_name = ""
        if kind in ("review", "cut"):
            clip_name = save_clip(kind, i, s_ms, e_ms)
        seg_rows.append({
            "idx": i, "kind": kind,
            "start_ms": s_ms + offset_ms, "end_ms": e_ms + offset_ms,
            "similarity": "" if np.isnan(sim) else round(sim, 4),
            "clip": clip_name, "label": "",   # user fills 'label' during feedback
        })

    # 4) Assemble kept set (bias-to-keep: include review unless config says not to).
    to_keep = list(keep_intervals)
    if out_cfg["include_review_in_output"]:
        to_keep += review_intervals
    kept = merge_intervals(to_keep, out_cfg["boundary_pad_ms"],
                           out_cfg["min_keep_segment_ms"], bound_ms)

    # 5) Build cleaned output with crossfades at joins.
    cleaned = None
    xf = int(out_cfg["crossfade_ms"])
    for s_ms, e_ms in kept:
        seg = full_audio[offset_ms + s_ms: offset_ms + e_ms]
        if cleaned is None:
            cleaned = seg
        else:
            cf = max(0, min(xf, len(seg) - 1, len(cleaned) - 1))
            cleaned = cleaned.append(seg, crossfade=cf)
    if cleaned is None:
        cleaned = AudioSegment.silent(duration=0)
    cleaned_path = cleaned_dir / f"{base}.{out_cfg['format']}"
    cleaned.export(cleaned_path, format=out_cfg["format"],
                   parameters=["-q:a", str(out_cfg["mp3_quality"])])

    # 6) Write segments.csv (the artifact the feedback loop consumes).
    with open(review_dir / "segments.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["idx", "kind", "start_ms", "end_ms",
                                          "similarity", "clip", "label"])
        w.writeheader()
        w.writerows(seg_rows)

    # 7) Transcript of the cleaned audio.
    transcript_path = transcripts_dir / f"{base}.txt"
    try:
        model = get_whisper()
        segments, _info = model.transcribe(str(cleaned_path))
        with open(transcript_path, "w", encoding="utf-8") as f:
            for s in segments:
                f.write(f"[{s.start:7.1f}-{s.end:7.1f}] {s.text.strip()}\n")
    except Exception as e:  # transcript is a QA aid — never fail the whole file for it
        print(f"[process] WARNING: transcription failed: {e}", file=sys.stderr)
        transcript_path = ""

    # 8) Metrics -> manifest.
    kept_ms = sum(e - s for s, e in kept)
    keep_lens_s = [(e - s) / 1000 for s, e in kept]
    n_keep = sum(1 for r in seg_rows if r["kind"] == "keep")
    n_review = sum(1 for r in seg_rows if r["kind"] == "review")
    n_cut = sum(1 for r in seg_rows if r["kind"] == "cut")
    row = {
        "file": base, "source": source, "speaker_slug": slug, "status": "ok",
        "duration_s": round(region_s, 1),
        "kept_pct": round(100 * kept_ms / bound_ms, 1) if bound_ms else 0,
        "cut_pct": round(100 * (bound_ms - kept_ms) / bound_ms, 1) if bound_ms else 0,
        "n_turns": len(turns),
        "keep_seg_avg_s": round(float(np.mean(keep_lens_s)), 1) if keep_lens_s else 0,
        "keep_seg_min_s": round(float(np.min(keep_lens_s)), 1) if keep_lens_s else 0,
        "keep_seg_max_s": round(float(np.max(keep_lens_s)), 1) if keep_lens_s else 0,
        "n_keep": n_keep, "n_review": n_review,
        "review_avg_conf": round(float(np.mean(review_sims)), 3) if review_sims else "",
        "n_cut": n_cut,
        "transcript_path": str(transcript_path),
        "cleaned_path": str(cleaned_path),
        "outlier_flags": "", "error": "",
    }
    append_manifest_row(row)

    # Clean up the big analysis wav (keep the review clips + segments.csv).
    try:
        work_wav.unlink()
    except OSError:
        pass

    print(f"[process] done: {base}  kept={row['kept_pct']}%  "
          f"keep={n_keep} review={n_review} cut={n_cut}  -> {cleaned_path}")
    return row


def _main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", help="Local audio file path OR a site lecture id.")
    ap.add_argument("output_dir", nargs="?", default=None,
                    help="Optional output root (defaults to project output/).")
    ap.add_argument("--speaker", help="Rabbi slug (required for local files).")
    ap.add_argument("--start", type=float, help="Trim start (seconds) — process only part.")
    ap.add_argument("--end", type=float, help="Trim end (seconds).")
    args = ap.parse_args()
    out = Path(args.output_dir) if args.output_dir else None
    process(args.input, out, args.speaker, args.start, args.end)
    return 0


if __name__ == "__main__":
    raise SystemExit(_main())
