/**
 * fetch-durations.mjs
 *
 * Fetches the audio duration for every lecture with duration === 0 in lectures.json.
 * Uses music-metadata with a partial HTTP fetch (first 200 KB) to read the bitrate,
 * then calculates duration from (fileSize * 8 / bitrate).
 *
 * Prerequisites:
 *   npm install --save-dev music-metadata
 *
 * Run once:
 *   node scripts/fetch-durations.mjs
 *
 * Optional env-var overrides (Windows: set VAR=val && node ...)
 *   CONCURRENCY=25    parallel requests (default 25)
 *   CHUNK_KB=200      KB to download per file (default 200)
 *   SAVE_EVERY=200    checkpoint-save interval (default 200)
 *   FORCE=1           re-fetch even lectures that already have a duration
 *   MAX_DUR=300       also re-fetch lectures whose duration is <= this many seconds
 *   R2_ONLY=1         only process R2 URLs (r2.dev) — skips ybt.org etc.
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseBuffer } from 'music-metadata'

const __dirname  = dirname(fileURLToPath(import.meta.url))
const DATA_PATH  = join(__dirname, '../data/lectures.json')

const CONCURRENCY = parseInt(process.env.CONCURRENCY ?? '25')
const CHUNK_BYTES = parseInt(process.env.CHUNK_KB    ?? '200') * 1024
const SAVE_EVERY  = parseInt(process.env.SAVE_EVERY  ?? '200')
const FORCE       = process.env.FORCE === '1'
const MAX_DUR     = parseInt(process.env.MAX_DUR     ?? '0')
const R2_ONLY     = process.env.R2_ONLY === '1'

// ─── Load ─────────────────────────────────────────────────────────────────────

const data = JSON.parse(readFileSync(DATA_PATH, 'utf8'))

// ─── Collect targets ──────────────────────────────────────────────────────────

function collectTargets(node) {
  const out = []
  for (const lec of node.lectures ?? []) {
    if (R2_ONLY && !lec.audioUrl?.includes('r2.dev')) continue
    const missing    = !lec.duration || lec.duration === 0
    const suspicious = MAX_DUR > 0 && lec.duration > 0 && lec.duration <= MAX_DUR
    if (FORCE || missing || suspicious) out.push(lec)
  }
  for (const child of node.children ?? []) out.push(...collectTargets(child))
  return out
}

const targets = data.categories.flatMap(collectTargets)
console.log(
  `[fetch-durations] ${targets.length} lectures to process  ` +
  `(CONCURRENCY=${CONCURRENCY}, CHUNK_KB=${CHUNK_BYTES / 1024}, SAVE_EVERY=${SAVE_EVERY}` +
  (MAX_DUR  ? `, MAX_DUR=${MAX_DUR}`   : '') +
  (R2_ONLY  ? `, R2_ONLY`             : '') + `)`
)

if (targets.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

// ─── Fetch duration for one lecture ──────────────────────────────────────────

async function getDuration(audioUrl) {
  const ext      = audioUrl.split('.').pop().toLowerCase().replace(/[?#].*$/, '')
  const mimeType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg'

  const res = await fetch(audioUrl, {
    headers: { Range: `bytes=0-${CHUNK_BYTES - 1}` },
    signal: AbortSignal.timeout(6_000),
  })

  if (!res.ok && res.status !== 206) throw new Error(`HTTP ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())

  let fileSize
  const contentRange = res.headers.get('content-range')
  if (contentRange) {
    const m = contentRange.match(/\/(\d+)$/)
    if (m) fileSize = parseInt(m[1])
  }
  if (!fileSize && res.status === 200) {
    const cl = res.headers.get('content-length')
    fileSize = cl ? parseInt(cl) : buf.length
  }

  const meta = await parseBuffer(buf, { mimeType })
  const bitrate = meta.format.bitrate

  let dur
  if (fileSize && bitrate && bitrate > 0) {
    dur = (fileSize * 8) / bitrate
  } else if (meta.format.duration && meta.format.duration > 0) {
    dur = meta.format.duration
  }

  if (!dur || dur <= 0) throw new Error('no duration in metadata')
  if (dur < 30) throw new Error(`duration suspiciously short (${Math.round(dur)}s)`)

  return Math.round(dur)
}

// ─── Save ─────────────────────────────────────────────────────────────────────

function saveJSON() {
  writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
}

// ─── Concurrency pool ─────────────────────────────────────────────────────────

let done = 0, updated = 0, failed = 0
const failLog = []

async function processLecture(lec) {
  try {
    const dur = await getDuration(lec.audioUrl)
    lec.duration = dur
    updated++
  } catch (err) {
    failed++
    failLog.push({ id: lec.id, url: lec.audioUrl, error: err.message })
  }

  done++

  if (done % SAVE_EVERY === 0) {
    saveJSON()
    const pct = ((done / targets.length) * 100).toFixed(1)
    console.log(`  [${pct}%] saved checkpoint — ${done}/${targets.length} processed, ${updated} updated, ${failed} failed`)
  } else if (done % 100 === 0) {
    const pct = ((done / targets.length) * 100).toFixed(1)
    process.stdout.write(`\r  [${pct}%] ${done}/${targets.length} | +${updated} durations | ${failed} errors   `)
  }
}

async function runPool(items, concurrency, fn) {
  const iter = items[Symbol.iterator]()
  async function worker() { for (const item of iter) await fn(item) }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

// ─── Run ──────────────────────────────────────────────────────────────────────

const t0 = Date.now()
await runPool(targets, CONCURRENCY, processLecture)

console.log('')
saveJSON()

const elapsed = ((Date.now() - t0) / 1000).toFixed(1)
console.log(`\n[fetch-durations] Done in ${elapsed}s`)
console.log(`  Updated : ${updated}`)
console.log(`  Failed  : ${failed}`)
console.log(`  Skipped : ${targets.length - updated - failed}`)

if (failLog.length > 0) {
  const logPath = join(__dirname, 'fetch-durations-failures.json')
  writeFileSync(logPath, JSON.stringify(failLog, null, 2))
  console.log(`  Failure log → scripts/fetch-durations-failures.json`)
}
