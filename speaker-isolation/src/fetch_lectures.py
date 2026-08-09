"""Resolve shiur lecture IDs to audio, using the site's source-of-truth catalog.

The catalog is `shiurim-app/data/lectures.json` (a tree of category nodes, each
leaf holding a `lectures[]` array). We flatten it to an id -> lecture map exactly
like the site's generate-node-data.mjs does (first occurrence wins on duplicate
ids, since a shiur can be cross-listed into multiple nodes).

Usable as a library (get_lecture / download_lecture / find_by_speaker) and from
the CLI:

    python src/fetch_lectures.py <lectureId>                 # download to cache, print path
    python src/fetch_lectures.py --speaker "schneeweiss"     # list matching lectures
    python src/fetch_lectures.py --info <lectureId>          # print metadata only
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from functools import lru_cache
from pathlib import Path

from common import load_config, path, safe_stem, slugify_speaker, ROOT


def _lectures_json_path() -> Path:
    cfg = load_config()
    p = (ROOT / cfg["site"]["lectures_json"]).resolve()
    return p


@lru_cache(maxsize=1)
def load_catalog() -> dict[str, dict]:
    """id -> lecture dict (with an added `speaker_slug`). Cached per process."""
    src = _lectures_json_path()
    if not src.exists():
        raise FileNotFoundError(
            f"Catalog not found at {src}. Check config.yaml site.lectures_json."
        )
    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)

    by_id: dict[str, dict] = {}

    def walk(node: dict) -> None:
        for lec in node.get("lectures", []) or []:
            lid = lec.get("id")
            if lid and lid not in by_id:
                rec = dict(lec)
                rec["speaker_slug"] = slugify_speaker(lec.get("speaker", ""))
                by_id[lid] = rec
        for child in node.get("children", []) or []:
            walk(child)

    for cat in data.get("categories", []) or []:
        walk(cat)
    return by_id


def get_lecture(lecture_id: str) -> dict | None:
    return load_catalog().get(lecture_id)


def find_by_speaker(query: str) -> list[dict]:
    """Case-insensitive substring match on speaker name; returns lecture dicts."""
    q = query.lower()
    return [lec for lec in load_catalog().values()
            if q in (lec.get("speaker", "").lower())]


def _download_url(url: str, dst: Path) -> Path:
    cfg = load_config()
    req = urllib.request.Request(url, headers={"User-Agent": cfg["site"]["user_agent"]})
    dst.parent.mkdir(parents=True, exist_ok=True)
    tmp = dst.with_suffix(dst.suffix + ".part")
    with urllib.request.urlopen(req, timeout=120) as resp, open(tmp, "wb") as out:
        while True:
            chunk = resp.read(1 << 16)
            if not chunk:
                break
            out.write(chunk)
    tmp.replace(dst)
    return dst


def download_lecture(lecture_id: str, dest_dir: Path | None = None) -> Path:
    """Download a lecture's audio into the cache (skips if already present)."""
    lec = get_lecture(lecture_id)
    if lec is None:
        raise KeyError(f"Lecture id not found in catalog: {lecture_id}")
    url = lec.get("audioUrl")
    if not url:
        raise ValueError(f"Lecture {lecture_id} has no audioUrl")

    if dest_dir is None:
        dest_dir = (ROOT / load_config()["site"]["download_cache"]).resolve()
    ext = Path(url.split("?")[0]).suffix or ".mp3"
    dst = Path(dest_dir) / f"{safe_stem(lecture_id)}{ext}"
    if dst.exists() and dst.stat().st_size > 0:
        return dst
    print(f"[fetch] downloading {lecture_id} <- {url}", file=sys.stderr)
    return _download_url(url, dst)


def _main() -> int:
    ap = argparse.ArgumentParser(description="Resolve/download shiur audio from the site catalog.")
    ap.add_argument("lecture_id", nargs="?", help="Lecture id to download.")
    ap.add_argument("--speaker", help="List lectures whose speaker matches this substring.")
    ap.add_argument("--info", metavar="ID", help="Print a lecture's metadata (no download).")
    ap.add_argument("--dest", help="Destination dir for download (default: config cache).")
    args = ap.parse_args()

    if args.speaker:
        matches = find_by_speaker(args.speaker)
        speakers = sorted({m["speaker"] for m in matches})
        print(f"{len(matches)} lectures across {len(speakers)} speaker name(s):")
        for s in speakers:
            print(f"  speaker={s!r}  slug={slugify_speaker(s)}  "
                  f"count={sum(1 for m in matches if m['speaker'] == s)}")
        for m in matches[:20]:
            print(f"    {m['id']}  {m.get('date','')}  {m.get('title','')[:70]}")
        if len(matches) > 20:
            print(f"    ... ({len(matches) - 20} more)")
        return 0

    if args.info:
        lec = get_lecture(args.info)
        if not lec:
            print(f"not found: {args.info}", file=sys.stderr)
            return 1
        print(json.dumps({k: lec.get(k) for k in
                          ("id", "title", "speaker", "speaker_slug", "date",
                           "duration", "audioUrl")}, indent=2, ensure_ascii=False))
        return 0

    if args.lecture_id:
        dest = Path(args.dest) if args.dest else None
        out = download_lecture(args.lecture_id, dest)
        print(out)
        return 0

    ap.print_help()
    return 1


if __name__ == "__main__":
    raise SystemExit(_main())
