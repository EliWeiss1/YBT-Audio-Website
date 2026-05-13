"""
export-db.py
Exports ybt_index.db to ybt_index.json for use by ybt-archive-import.js
Run from project root:
  python scripts/export-db.py
  python scripts/export-db.py --db "C:\path\to\ybt_index.db"
"""

import sqlite3
import json
import sys
import os

# Find DB
db_path = None
args = sys.argv[1:]
if '--db' in args:
    db_path = args[args.index('--db') + 1]
else:
    candidates = [
        r'C:\Users\eliis\TTL_Archived_Website\ybt_index.db',
        os.path.join(os.path.expanduser('~'), 'TTL_Archived_Website', 'ybt_index.db'),
        'ybt_index.db',
    ]
    db_path = next((p for p in candidates if os.path.exists(p)), None)

if not db_path or not os.path.exists(db_path):
    print('ERROR: Cannot find ybt_index.db. Use --db PATH to specify location.')
    sys.exit(1)

out_path = os.path.join('data', 'ybt_index.json')
os.makedirs('data', exist_ok=True)

print(f'Reading {db_path}...')
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
c = conn.cursor()
c.execute('SELECT rowid, url, title, anchor_text, date_iso, rabbi, section, category, ext FROM audio')
rows = [dict(row) for row in c.fetchall()]
conn.close()

with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=2)

print(f'Exported {len(rows)} rows to {out_path}')
