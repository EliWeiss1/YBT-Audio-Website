#!/usr/bin/env python3
"""
Fill in empty descriptions in lectures.json using data from TTLlist_Metadata.pdf.

Usage: python apply_descriptions.py
Run from any directory. Backs up lectures.json first.
"""
import json, re, shutil, os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LECTURES_PATH = os.path.join(SCRIPT_DIR, "lectures.json")
DESCRIPTIONS_PATH = os.path.join(SCRIPT_DIR, "pdf_descriptions.json")

with open(DESCRIPTIONS_PATH, "r", encoding="utf-8") as f:
    DESCRIPTIONS = json.load(f)

print(f"Loaded {len(DESCRIPTIONS)} descriptions from PDF")


def update_nodes(node):
    updated = skipped = 0
    if isinstance(node, dict):
        sid = str(node.get("id", ""))
        if re.match(r"^[A-Z]{1,2}-\d", sid) and "description" in node:
            if sid in DESCRIPTIONS and not node["description"]:
                node["description"] = DESCRIPTIONS[sid]
                updated += 1
            elif sid in DESCRIPTIONS:
                # Already has a description — leave it alone
                skipped += 1
        for v in node.values():
            u, s = update_nodes(v)
            updated += u
            skipped += s
    elif isinstance(node, list):
        for item in node:
            u, s = update_nodes(item)
            updated += u
            skipped += s
    return updated, skipped


print("Loading lectures.json...")
with open(LECTURES_PATH, "r", encoding="utf-8") as f:
    data = json.load(f)

backup = LECTURES_PATH + ".backup-desc-update"
shutil.copy2(LECTURES_PATH, backup)
print(f"Backup saved: {os.path.basename(backup)}")

updated, skipped = update_nodes(data)
print(f"  Filled in:  {updated} descriptions (were empty)")
print(f"  Kept as-is: {skipped} (already had descriptions)")

with open(LECTURES_PATH, "w", encoding="utf-8") as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print("Done — lectures.json updated.")
