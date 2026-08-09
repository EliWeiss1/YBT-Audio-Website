"""Shared helpers for the speaker-isolation pipeline.

Everything the other scripts lean on: config loading, project paths, ffmpeg
wrappers, device detection, slugs, cosine similarity, the manifest schema, and
lazily-loaded model singletons (diarizer / embedder / whisper).

Heavy ML imports (torch, pyannote, speechbrain, faster_whisper) are done INSIDE
the functions that need them, so lightweight callers (e.g. fetch_lectures.py)
can import this module without paying for — or requiring — the ML stack.
"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import sys
from functools import lru_cache
from pathlib import Path
from typing import Iterable

import numpy as np
import yaml

# Project root is speaker-isolation/  (this file is speaker-isolation/src/common.py)
ROOT = Path(__file__).resolve().parent.parent


# --------------------------------------------------------------------------- #
# Config + paths
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def load_config() -> dict:
    with open(ROOT / "config.yaml", "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def path(*parts: str) -> Path:
    """Resolve a path relative to the project root."""
    return ROOT.joinpath(*parts)


# Canonical output locations.
CLEANED_DIR = ROOT / "output" / "cleaned"
TRANSCRIPTS_DIR = ROOT / "output" / "transcripts"
REVIEW_QUEUE_DIR = ROOT / "output" / "review_queue"
PROFILES_DIR = ROOT / "profiles"
MODELS_DIR = ROOT / "models"
MANIFEST_PATH = ROOT / "logs" / "manifest.csv"


def ensure_dirs() -> None:
    for d in (CLEANED_DIR, TRANSCRIPTS_DIR, REVIEW_QUEUE_DIR, PROFILES_DIR,
              MODELS_DIR, MANIFEST_PATH.parent):
        d.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- #
# Slugs
# --------------------------------------------------------------------------- #
def slugify_speaker(name: str) -> str:
    """Mirror the site's slug idea: lowercase, non-alphanumerics -> single '-'.

    "Rabbi Matt Schneeweiss" -> "rabbi-matt-schneeweiss"
    """
    s = (name or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def safe_stem(name: str) -> str:
    """Filesystem-safe stem for a filename derived from an id/title."""
    return re.sub(r"[^A-Za-z0-9._-]+", "_", name).strip("_") or "file"


# --------------------------------------------------------------------------- #
# Math
# --------------------------------------------------------------------------- #
def cosine(a: np.ndarray, b: np.ndarray) -> float:
    a = np.asarray(a, dtype=np.float64).ravel()
    b = np.asarray(b, dtype=np.float64).ravel()
    denom = (np.linalg.norm(a) * np.linalg.norm(b))
    if denom == 0:
        return 0.0
    return float(np.dot(a, b) / denom)


# --------------------------------------------------------------------------- #
# ffmpeg / ffprobe (assumed on PATH — matches the rest of the repo)
# --------------------------------------------------------------------------- #
def require_ffmpeg() -> None:
    missing = [t for t in ("ffmpeg", "ffprobe") if shutil.which(t) is None]
    if missing:
        raise RuntimeError(
            f"Missing required tool(s) on PATH: {', '.join(missing)}. "
            "Install ffmpeg (see README) and re-run."
        )


def ffprobe_duration(src: os.PathLike | str) -> float:
    """Duration in seconds via ffprobe, or 0.0 if it can't be read."""
    out = subprocess.run(
        ["ffprobe", "-v", "quiet", "-print_format", "json",
         "-show_format", src.__fspath__() if hasattr(src, "__fspath__") else str(src)],
        capture_output=True, text=True,
    )
    try:
        import json
        return float(json.loads(out.stdout)["format"]["duration"])
    except Exception:
        return 0.0


def decode_to_wav(src: os.PathLike | str, dst: os.PathLike | str,
                  sr: int = 16000, start: float | None = None,
                  end: float | None = None) -> Path:
    """Decode (and optionally trim) any input to mono PCM wav at `sr` Hz.

    Used to feed the diarizer / embedder a consistent format. Trimming here also
    implements the optional partial-shiur (--start/--end) processing.
    """
    dst = Path(dst)
    cmd = ["ffmpeg", "-y", "-loglevel", "error"]
    if start is not None:
        cmd += ["-ss", str(start)]
    if end is not None:
        # -to is relative to the input start; when -ss precedes -i it's absolute,
        # so pass duration instead to stay correct.
        dur = end - (start or 0.0)
        cmd += ["-t", str(dur)]
    cmd += ["-i", str(src), "-vn", "-ac", "1", "-ar", str(sr), "-f", "wav", str(dst)]
    subprocess.run(cmd, check=True)
    return dst


def transcode_to_mp3(src: os.PathLike | str, dst: os.PathLike | str,
                     quality: int = 3) -> Path:
    """Transcode to mp3 with libmp3lame VBR (repo convention: -q:a 3)."""
    dst = Path(dst)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src),
         "-vn", "-acodec", "libmp3lame", "-q:a", str(quality), str(dst)],
        check=True,
    )
    return dst


# --------------------------------------------------------------------------- #
# Device detection
# --------------------------------------------------------------------------- #
@lru_cache(maxsize=1)
def get_device() -> str:
    """Resolve config `device` to a concrete torch device string, with warnings."""
    cfg = load_config()
    want = str(cfg.get("device", "cpu")).lower()
    try:
        import torch
    except Exception:
        print("[device] torch not importable yet — assuming cpu.", file=sys.stderr)
        return "cpu"

    if want == "cuda" or want == "auto":
        if torch.cuda.is_available():
            return "cuda"
        if want == "cuda":
            print("[device] WARNING: device=cuda requested but no CUDA GPU found; "
                  "falling back to CPU.", file=sys.stderr)

    # Intel Arc / XPU is intentionally not the default (experimental on Windows).
    if want == "xpu":
        if getattr(torch, "xpu", None) is not None and torch.xpu.is_available():
            print("[device] Using experimental Intel XPU backend.", file=sys.stderr)
            return "xpu"
        print("[device] WARNING: device=xpu requested but XPU unavailable; using CPU.",
              file=sys.stderr)

    print("[device] Running on CPU. Diarization + Whisper are SLOW on CPU — "
          "expect several minutes per ~1h file. Run large batches overnight.",
          file=sys.stderr)
    return "cpu"


# --------------------------------------------------------------------------- #
# Model singletons (lazy)
# --------------------------------------------------------------------------- #
_EMBEDDER = None
_DIARIZER = None
_WHISPER = None


def get_embedder():
    """SpeechBrain ECAPA-TDNN embedder (cached)."""
    global _EMBEDDER
    if _EMBEDDER is not None:
        return _EMBEDDER
    import torch  # noqa: F401
    try:  # speechbrain >= 1.0
        from speechbrain.inference.speaker import EncoderClassifier
    except Exception:  # older speechbrain
        from speechbrain.pretrained import EncoderClassifier
    cfg = load_config()
    _EMBEDDER = EncoderClassifier.from_hparams(
        source=cfg["models"]["embedding"],
        savedir=str(MODELS_DIR / "ecapa"),
        run_opts={"device": get_device()},
    )
    return _EMBEDDER


def get_diarizer():
    """pyannote speaker-diarization pipeline (cached). Needs HF_TOKEN."""
    global _DIARIZER
    if _DIARIZER is not None:
        return _DIARIZER
    import torch
    from pyannote.audio import Pipeline
    token = os.environ.get("HF_TOKEN") or os.environ.get("HUGGINGFACE_TOKEN")
    if not token:
        raise RuntimeError(
            "HF_TOKEN not set. The pyannote diarization model is gated: create a "
            "HuggingFace token, accept the model terms, and set HF_TOKEN in your "
            "environment (see README). Never commit the token."
        )
    cfg = load_config()
    pipe = Pipeline.from_pretrained(cfg["models"]["diarization"], use_auth_token=token)
    if pipe is None:
        raise RuntimeError(
            "pyannote returned no pipeline — you likely haven't accepted the model's "
            "terms on HuggingFace, or the token lacks access. See README."
        )
    pipe.to(torch.device(get_device()))
    _DIARIZER = pipe
    return _DIARIZER


def get_whisper():
    """faster-whisper model (cached)."""
    global _WHISPER
    if _WHISPER is not None:
        return _WHISPER
    from faster_whisper import WhisperModel
    cfg = load_config()
    device = get_device()
    compute = cfg["models"].get("whisper_compute_type", "int8")
    if device == "cuda":
        compute = "float16"
    _WHISPER = WhisperModel(
        cfg["models"]["whisper"],
        device="cuda" if device == "cuda" else "cpu",
        compute_type=compute,
        download_root=str(MODELS_DIR / "whisper"),
    )
    return _WHISPER


# --------------------------------------------------------------------------- #
# Embedding helpers
# --------------------------------------------------------------------------- #
def embed_windows(samples: np.ndarray, sr: int) -> np.ndarray | None:
    """Embed audio by averaging ECAPA embeddings over a few short windows.

    `samples` is a mono float32 array at `sr` Hz. For short clips this is a
    single window; for long clips (reference shiurim, long turns) it spreads
    `max_windows` windows of `window_s` evenly across the clip and averages —
    more stable than one giant pooled embedding. Returns a 1-D vector, or None
    if the clip is too short to embed.
    """
    import torch
    cfg = load_config()["embedding"]
    win = int(cfg["window_s"] * sr)
    max_w = int(cfg["max_windows"])
    min_len = int(cfg["min_segment_s"] * sr)

    n = len(samples)
    if n < min_len:
        return None

    if n <= win:
        starts = [0]
    else:
        k = min(max_w, max(1, n // win))
        # Evenly spaced, non-overlapping-ish window starts across the clip.
        starts = [int(i * (n - win) / max(1, k - 1)) for i in range(k)] if k > 1 else [0]

    model = get_embedder()
    embs = []
    for s0 in starts:
        chunk = samples[s0:s0 + win]
        if len(chunk) < min_len:
            continue
        wav = torch.tensor(chunk, dtype=torch.float32).unsqueeze(0)  # [1, T]
        with torch.no_grad():
            emb = model.encode_batch(wav)  # [1, 1, D]
        embs.append(emb.squeeze().detach().cpu().numpy())
    if not embs:
        return None
    v = np.mean(np.stack(embs, axis=0), axis=0)
    return v.astype(np.float32)


# --------------------------------------------------------------------------- #
# Manifest
# --------------------------------------------------------------------------- #
MANIFEST_FIELDS = [
    "file", "source", "speaker_slug", "status", "duration_s",
    "kept_pct", "cut_pct", "n_turns", "keep_seg_avg_s", "keep_seg_min_s",
    "keep_seg_max_s", "n_keep", "n_review", "review_avg_conf", "n_cut",
    "transcript_path", "cleaned_path", "outlier_flags", "error",
]


def append_manifest_row(row: dict) -> None:
    import csv
    ensure_dirs()
    exists = MANIFEST_PATH.exists()
    with open(MANIFEST_PATH, "a", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS, extrasaction="ignore")
        if not exists:
            w.writeheader()
        w.writerow({k: row.get(k, "") for k in MANIFEST_FIELDS})


def manifest_done_keys() -> set[str]:
    """Set of `file` values already recorded as successfully processed.

    Used for resumability — a row with a non-empty error does NOT count as done.
    """
    import csv
    if not MANIFEST_PATH.exists():
        return set()
    done = set()
    with open(MANIFEST_PATH, "r", newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("file") and not r.get("error"):
                done.add(r["file"])
    return done
