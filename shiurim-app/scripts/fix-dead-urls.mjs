/**
 * fix-dead-urls.mjs
 *
 * Cross-references 404 dead audioUrls in lectures.json against ybt_index.db
 * and replaces them with the correct current URLs.
 *
 * Three match strategies (in order):
 *  1. Exact: http → https normalisation finds the DB entry directly
 *  2. Date+single: same directory + same date prefix, only one DB file on that date
 *  3. Date+title: same directory + same date prefix, best title-word-overlap among candidates
 *
 * Run: node scripts/fix-dead-urls.mjs
 *
 * Requires:
 *   - scripts/fetch-durations-failures.json  (from fetch-durations.mjs)
 *   - The DB path below (edit if needed)
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import Database from 'better-sqlite3'

const __dirname     = dirname(fileURLToPath(import.meta.url))
const DATA_PATH     = join(__dirname, '../data/lectures.json')
const FAILURES_PATH = join(__dirname, 'fetch-durations-failures.json')
const DB_PATH       = 'C:/Users/eliis/TTL_Archived_Website/ybt_index.db'

// ─── Load ─────────────────────────────────────────────────────────────────────

const data     = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const failures = JSON.parse(readFileSync(FAILURES_PATH, 'utf8'))
const dead404  = failures.filter(f => f.error === 'HTTP 404')

console.log(`[fix-dead-urls] ${dead404.length} dead links to process`)

// ─── Build DB lookups ─────────────────────────────────────────────────────────

const db = new Database(DB_PATH, { readonly: true })
const dbRows = db.prepare('SELECT url, title FROM audio').all()
db.close()

console.log(`[fix-dead-urls] ${dbRows.length} entries in DB`)

const dbByUrlLower = new Map()       // normalized url → row
const dbByDirDate  = new Map()       // "dir|date_prefix" → row[]

for (const row of dbRows) {
  dbByUrlLower.set(row.url.toLowerCase(), row)

  const p    = new URL(row.url)
  const dir  = p.pathname.split('/').slice(0, -1).join('/')
  const file = p.pathname.split('/').at(-1)
  const key  = `${dir}|${file.slice(0, 10)}`
  if (!dbByDirDate.has(key)) dbByDirDate.set(key, [])
  dbByDirDate.get(key).push(row)
}

// ─── Title similarity ─────────────────────────────────────────────────────────

function similarity(a, b) {
  const words = s => new Set(s.toLowerCase().replace(/[_\-\.]/g, ' ').split(/\s+/).filter(Boolean))
  const wa = words(a), wb = words(b)
  let overlap = 0
  for (const w of wa) if (wb.has(w)) overlap++
  return overlap / Math.max(wa.size, wb.size)
}

// ─── Match one URL ────────────────────────────────────────────────────────────

function findCorrectUrl(oldUrl) {
  // Strategy 1: exact (http → https)
  const httpsLower = oldUrl.replace(/^http:\/\//i, 'https://').toLowerCase()
  if (dbByUrlLower.has(httpsLower)) {
    return { url: dbByUrlLower.get(httpsLower).url, strategy: 'exact' }
  }

  // Strategy 2 & 3: dir + date prefix
  const p    = new URL(oldUrl)
  const dir  = p.pathname.split('/').slice(0, -1).join('/')
  const file = p.pathname.split('/').at(-1)
  const key  = `${dir}|${file.slice(0, 10)}`
  const hits = dbByDirDate.get(key) ?? []

  if (hits.length === 1) {
    return { url: hits[0].url, strategy: 'date_single' }
  }
  if (hits.length > 1) {
    const best = hits.reduce((a, b) =>
      similarity(file, new URL(b.url).pathname.split('/').at(-1)) >
      similarity(file, new URL(a.url).pathname.split('/').at(-1)) ? b : a
    )
    const score = similarity(file, new URL(best.url).pathname.split('/').at(-1))
    if (score > 0.3) {
      return { url: best.url, strategy: `date_title(score=${score.toFixed(2)})` }
    }
  }

  return null
}

// ─── Build lecture map ────────────────────────────────────────────────────────

const lectureMap = new Map()
function walk(node) {
  for (const lec of node.lectures ?? []) lectureMap.set(lec.id, lec)
  for (const child of node.children ?? []) walk(child)
}
for (const cat of data.categories) walk(cat)

// ─── Apply fixes ──────────────────────────────────────────────────────────────

let fixed = 0, unmatched = 0
const unmatchedLog = []
const byStrategy = {}

for (const failure of dead404) {
  const lec = lectureMap.get(failure.id)
  if (!lec) continue

  const match = findCorrectUrl(failure.url)
  if (match) {
    console.log(`  ✓ [${match.strategy}] ${failure.id}`)
    console.log(`      ${failure.url}`)
    console.log(`    → ${match.url}`)
    lec.audioUrl = match.url
    fixed++
    byStrategy[match.strategy] = (byStrategy[match.strategy] ?? 0) + 1
  } else {
    unmatched++
    unmatchedLog.push({ id: failure.id, url: failure.url })
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────────

writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))

const unmatchedPath = join(__dirname, 'fix-dead-urls-unmatched.json')
writeFileSync(unmatchedPath, JSON.stringify(unmatchedLog, null, 2))

console.log(`\n[fix-dead-urls] Done`)
console.log(`  Fixed     : ${fixed}`)
console.log(`  Unmatched : ${unmatched} → scripts/fix-dead-urls-unmatched.json`)
console.log(`  By strategy:`)
for (const [s, n] of Object.entries(byStrategy)) console.log(`    ${n}  ${s}`)
