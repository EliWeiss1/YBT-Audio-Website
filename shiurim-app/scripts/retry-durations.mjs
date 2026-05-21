/**
 * retry-durations.mjs
 *
 * Retries duration fetching for the non-404 failures from fetch-durations-failures.json.
 * Uses more aggressive strategies: full file download (no Range header) and redirect-following.
 *
 * Run: node scripts/retry-durations.mjs
 */

import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { parseBuffer } from 'music-metadata'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_PATH     = join(__dirname, '../data/lectures.json')
const FAILURES_PATH = join(__dirname, 'fetch-durations-failures.json')

const CONCURRENCY = 10   // lower — we're downloading full files for some

// ─── Load ─────────────────────────────────────────────────────────────────────

const data     = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
const failures = JSON.parse(readFileSync(FAILURES_PATH, 'utf8'))

// Skip 404s — those files are gone
const retryable = failures.filter(f => f.error !== 'HTTP 404')
console.log(`[retry-durations] ${retryable.length} retryable failures (skipping ${failures.length - retryable.length} 404s)`)

// Build id → lecture reference map
const lectureMap = new Map()
function walk(node) {
  for (const lec of node.lectures ?? []) lectureMap.set(lec.id, lec)
  for (const child of node.children ?? []) walk(child)
}
for (const cat of data.categories) walk(cat)

// ─── Fetch strategies ─────────────────────────────────────────────────────────

async function getDurationFull(audioUrl) {
  // Full file download — no Range header, follow redirects
  const res = await fetch(audioUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())
  const ext = audioUrl.split('.').pop().toLowerCase().replace(/\?.*$/, '')
  const mimeType = ext === 'm4a' ? 'audio/mp4' : 'audio/mpeg'
  const meta = await parseBuffer(buf, { mimeType, size: buf.length })
  const dur = meta.format.duration
  if (!dur || dur <= 0) throw new Error('no duration in metadata')
  return Math.round(dur)
}

// ─── Process ──────────────────────────────────────────────────────────────────

let updated = 0, stillFailed = 0
const newFailures = []

async function processOne(failure) {
  const lec = lectureMap.get(failure.id)
  if (!lec) {
    console.log(`  SKIP ${failure.id} — not found in lectures.json`)
    return
  }

  try {
    const dur = await getDurationFull(failure.url)
    lec.duration = dur
    updated++
    console.log(`  ✓ ${failure.id} → ${dur}s  (was: ${failure.error})`)
  } catch (err) {
    stillFailed++
    newFailures.push({ id: failure.id, url: failure.url, prevError: failure.error, error: err.message })
    console.log(`  ✗ ${failure.id} → ${err.message}`)
  }
}

async function runPool(items, concurrency, fn) {
  const iter = items[Symbol.iterator]()
  async function worker() { for (const item of iter) await fn(item) }
  await Promise.all(Array.from({ length: concurrency }, worker))
}

await runPool(retryable, CONCURRENCY, processOne)

// Save
writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
console.log(`\n[retry-durations] Done`)
console.log(`  Updated     : ${updated}`)
console.log(`  Still failed: ${stillFailed}`)

if (newFailures.length > 0) {
  writeFileSync(FAILURES_PATH, JSON.stringify(newFailures, null, 2))
  console.log(`  Updated failure log → scripts/fetch-durations-failures.json`)
}
