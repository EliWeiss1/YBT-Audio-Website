#!/usr/bin/env node
// Rewrite every lecture's `speaker` in data/lectures.json to its canonical name
// (rules: data/rabbi-aliases.json via scripts/lib/rabbi-normalization.cjs).
//
//   npm run normalize-speakers            # rewrite in place
//   npm run normalize-speakers -- --check # report only; exit 1 if anything would change
//
// Edits are string-level ("speaker": "<old>" → "speaker": "<new>") so the file's
// formatting and key order are untouched and the git diff is just the renamed lines.
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { normalizeRabbi } from './lib/rabbi-normalization.cjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const FILE = join(__dirname, '../data/lectures.json')
const CHECK = process.argv.includes('--check')

function collectSpeakers(node, out) {
  if (Array.isArray(node)) { for (const n of node) collectSpeakers(n, out); return }
  if (!node || typeof node !== 'object') return
  if (Array.isArray(node.lectures)) {
    for (const l of node.lectures) if (typeof l.speaker === 'string') out.set(l.speaker, (out.get(l.speaker) ?? 0) + 1)
  }
  for (const [k, v] of Object.entries(node)) if (k !== 'lectures') collectSpeakers(v, out)
}

let text = readFileSync(FILE, 'utf8')
const counts = new Map()
collectSpeakers(JSON.parse(text), counts)

const changes = [...counts]
  .map(([raw, n]) => ({ raw, n, canon: normalizeRabbi(raw) }))
  .filter(c => c.canon !== c.raw)

if (!changes.length) { console.log('[normalize-speakers] all speaker names already canonical'); process.exit(0) }

for (const c of changes) console.log(`  ${String(c.n).padStart(5)}  "${c.raw}" → "${c.canon}"`)
if (CHECK) { console.error(`[normalize-speakers] ${changes.length} non-canonical speaker name(s) — run: npm run normalize-speakers`); process.exit(1) }

for (const c of changes) {
  const needle = new RegExp(`("speaker":\\s*)${JSON.stringify(c.raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g')
  let hits = 0
  text = text.replace(needle, (_, pre) => { hits++; return pre + JSON.stringify(c.canon) })
  if (hits !== c.n) throw new Error(`"${c.raw}": expected ${c.n} occurrence(s), replaced ${hits} — aborting, file not written`)
}

// Sanity check before writing: still valid JSON and nothing left to normalize.
const after = new Map()
collectSpeakers(JSON.parse(text), after)
const left = [...after.keys()].filter(s => normalizeRabbi(s) !== s)
if (left.length) throw new Error(`still non-canonical after rewrite: ${left.join(', ')}`)

writeFileSync(FILE, text)
console.log(`[normalize-speakers] rewrote ${changes.reduce((n, c) => n + c.n, 0)} speaker field(s) across ${changes.length} name(s)`)
