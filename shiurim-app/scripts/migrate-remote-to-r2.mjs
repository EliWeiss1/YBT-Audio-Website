// =============================================================================
// migrate-remote-to-r2.mjs — bulk-migrate existing shiurim off external hosts (the old
// ybt.org/www.ybt.org server, download.yutorah.org) into our own R2 bucket, in place in
// data/lectures.json. NOT one of the four ongoing ingest mechanisms in CLAUDE.md — this is
// a one-time backfill for lectures that were already cataloged with an external audioUrl.
//
// Resumability needs no separate checkpoint: an audioUrl already pointing at R2_PUBLIC_URL
// IS "done", so re-running just picks up whatever's left. The only extra state is
// scripts/r2-migration-output/failures.json, which caps retries per lecture (default 3
// attempts across runs) so a permanently-dead URL doesn't get hammered forever or keep the
// GitHub Actions self-chaining loop (see .github/workflows/r2-migration.yml) alive forever.
//
// Safe to kill at any point: progress (lectures.json + failures.json) is flushed to disk
// every FLUSH_EVERY successful/failed items and on SIGTERM/SIGINT, and every item runs
// against a wall-clock deadline (--time-budget minutes) so the script stops dispatching new
// work and exits cleanly well before a CI job timeout would hard-kill it.
//
// Flags: --max N (cap items this run, for testing), --dry-run (report counts only),
//        --concurrency N (default 16 total workers), --ybt-concurrency / --yutorah-concurrency
//        (per-host caps — ybt.org is an old shared host, kept low; YUTorah's CDN can take more),
//        --time-budget MIN (default 300), --max-attempts N (default 3).
// Env: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_URL.
// =============================================================================
import { config } from 'dotenv'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

config({ path: '.env.local' }) // local dev; a no-op in CI where env comes from the workflow

// ── CLI flags ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    max: Infinity, dryRun: false, concurrency: 16,
    ybtConcurrency: 6, yutorahConcurrency: 10, otherConcurrency: 3,
    timeBudgetMin: 300, maxAttempts: 3,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--max') out.max = parseInt(argv[++i], 10)
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--concurrency') out.concurrency = parseInt(argv[++i], 10)
    else if (a === '--ybt-concurrency') out.ybtConcurrency = parseInt(argv[++i], 10)
    else if (a === '--yutorah-concurrency') out.yutorahConcurrency = parseInt(argv[++i], 10)
    else if (a === '--time-budget') out.timeBudgetMin = parseInt(argv[++i], 10)
    else if (a === '--max-attempts') out.maxAttempts = parseInt(argv[++i], 10)
  }
  return out
}
const ARGS = parseArgs(process.argv.slice(2))

// ── paths (resolved relative to this file, so cwd doesn't matter) ──────────────
const LECTURES_PATH = fileURLToPath(new URL('../data/lectures.json', import.meta.url))
const OUT_DIR = fileURLToPath(new URL('./r2-migration-output/', import.meta.url))
const FAILURES_PATH = `${OUT_DIR}failures.json`
const STATUS_PATH = `${OUT_DIR}status.json`

const EXT_CONTENT_TYPE = { mp3: 'audio/mpeg', mp4: 'audio/mp4', m4a: 'audio/mp4' }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

function extFromUrl(url) {
  const m = url.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/)
  return m ? m[1].toLowerCase() : null
}

function hostBucket(url) {
  let host
  try { host = new URL(url).hostname } catch { return 'other' }
  if (host === 'ybt.org' || host === 'www.ybt.org') return 'ybt'
  if (host === 'download.yutorah.org') return 'yutorah'
  return 'other'
}

function walkLectures(node, fn) {
  if (Array.isArray(node)) { node.forEach((n) => walkLectures(n, fn)); return }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.lectures)) node.lectures.forEach(fn)
    if (Array.isArray(node.children)) node.children.forEach((c) => walkLectures(c, fn))
  }
}

// Per-host-bucket concurrency gate. The old ybt.org shared host has no CDN behind it, so it's
// capped low; the global worker pool (ARGS.concurrency) just needs to be >= the sum of the
// per-bucket caps for all of them to be fully utilized at once.
class HostLimiter {
  constructor(limits) {
    this.limits = limits
    this.active = Object.fromEntries(Object.keys(limits).map((k) => [k, 0]))
    this.queues = Object.fromEntries(Object.keys(limits).map((k) => [k, []]))
  }
  async acquire(bucket) {
    if (this.active[bucket] < this.limits[bucket]) { this.active[bucket]++; return }
    await new Promise((resolve) => this.queues[bucket].push(resolve))
    this.active[bucket]++
  }
  release(bucket) {
    this.active[bucket]--
    const next = this.queues[bucket].shift()
    if (next) next()
  }
}

async function fetchWithTimeout(url, ms) {
  const controller = new AbortController()
  const t = setTimeout(() => controller.abort(), ms)
  try {
    return await fetch(url, { signal: controller.signal })
  } finally {
    clearTimeout(t)
  }
}

function r2KeyFor(lecture, ext) {
  return `migrated/${lecture.id}.${ext}`
}

function publicUrlFor(key, r2PublicUrl) {
  const encoded = key.split('/').map(encodeURIComponent).join('/')
  return `${r2PublicUrl}/${encoded}`
}

async function migrateOnce(lecture, r2, { timeoutMs, r2PublicUrl }) {
  const ext = extFromUrl(lecture.audioUrl)
  if (!ext || !EXT_CONTENT_TYPE[ext]) {
    return { ok: false, permanent: true, error: `unsupported extension: ${ext ?? '(none)'}` }
  }

  let res
  try {
    res = await fetchWithTimeout(lecture.audioUrl, timeoutMs)
  } catch (e) {
    return { ok: false, permanent: false, error: `download error: ${e.message}` }
  }
  if (!res.ok) return { ok: false, permanent: false, error: `download HTTP ${res.status}` }

  let buf
  try {
    buf = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return { ok: false, permanent: false, error: `read body failed: ${e.message}` }
  }
  if (buf.length === 0) return { ok: false, permanent: false, error: 'empty response body' }

  const key = r2KeyFor(lecture, ext)
  try {
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: key,
      Body: buf,
      ContentType: EXT_CONTENT_TYPE[ext],
    }))
  } catch (e) {
    return { ok: false, permanent: false, error: `R2 upload failed: ${e.message}` }
  }

  return { ok: true, url: publicUrlFor(key, r2PublicUrl), bytes: buf.length }
}

async function migrateWithRetry(lecture, r2, opts) {
  let last
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await migrateOnce(lecture, r2, opts)
    if (result.ok || result.permanent) return result
    last = result
    if (attempt === 0) await sleep(2000)
  }
  return last
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  if (!ARGS.dryRun) {
    const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL']
      .filter((k) => !process.env[k])
    if (missing.length) throw new Error(`Missing env: ${missing.join(', ')}. Use --dry-run to test without them.`)
  }
  const r2PublicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')

  mkdirSync(OUT_DIR, { recursive: true })
  const data = JSON.parse(readFileSync(LECTURES_PATH, 'utf8'))
  const failures = existsSync(FAILURES_PATH) ? JSON.parse(readFileSync(FAILURES_PATH, 'utf8')) : {}

  const allLectures = []
  walkLectures(data.categories, (l) => allLectures.push(l))

  function currentCounts() {
    let onR2 = 0, remainingEligible = 0, permanentlyFailed = 0
    for (const l of allLectures) {
      if (l.audioUrl && r2PublicUrl && l.audioUrl.startsWith(`${r2PublicUrl}/`)) { onR2++; continue }
      const f = failures[l.id]
      if (f && f.attempts >= ARGS.maxAttempts) permanentlyFailed++
      else remainingEligible++
    }
    return { onR2, remainingEligible, permanentlyFailed }
  }

  const startCounts = currentCounts()
  console.log(`Total lectures: ${allLectures.length}`)
  console.log(`Already on R2: ${startCounts.onR2}`)
  console.log(`Not yet on R2: ${startCounts.remainingEligible + startCounts.permanentlyFailed} (eligible: ${startCounts.remainingEligible}, permanently failed: ${startCounts.permanentlyFailed})`)

  const eligible = allLectures.filter((l) => {
    if (l.audioUrl && r2PublicUrl && l.audioUrl.startsWith(`${r2PublicUrl}/`)) return false
    const f = failures[l.id]
    return !(f && f.attempts >= ARGS.maxAttempts)
  })
  const queue = Number.isFinite(ARGS.max) ? eligible.slice(0, ARGS.max) : eligible
  console.log(`Queued for this run: ${queue.length}\n`)

  if (ARGS.dryRun) { console.log('[dry-run] no downloads/uploads/writes.'); return }
  if (queue.length === 0) { console.log('Nothing to do.'); return }

  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })

  const deadline = Date.now() + ARGS.timeBudgetMin * 60_000
  const limiter = new HostLimiter({ ybt: ARGS.ybtConcurrency, yutorah: ARGS.yutorahConcurrency, other: ARGS.otherConcurrency })

  let migrated = 0, failedThisRun = 0, newPermanent = 0, stoppedForDeadline = false, shuttingDown = false
  let dirty = false

  function flush() {
    writeFileSync(LECTURES_PATH, JSON.stringify(data, null, 2), 'utf8')
    writeFileSync(FAILURES_PATH, JSON.stringify(failures, null, 2), 'utf8')
    const counts = currentCounts()
    writeFileSync(STATUS_PATH, JSON.stringify({
      updatedAt: new Date().toISOString(),
      totalLectures: allLectures.length,
      onR2: counts.onR2,
      remainingEligible: counts.remainingEligible,
      permanentlyFailed: counts.permanentlyFailed,
      complete: counts.remainingEligible === 0,
      lastRun: { migrated, failedThisRun, queuedThisRun: queue.length, stoppedForDeadline },
    }, null, 2), 'utf8')
    dirty = false
  }

  const onShutdown = (sig) => {
    console.log(`\n${sig} received — flushing progress and exiting.`)
    shuttingDown = true
    if (dirty) flush()
    process.exit(0)
  }
  process.on('SIGTERM', () => onShutdown('SIGTERM'))
  process.on('SIGINT', () => onShutdown('SIGINT'))

  let idx = 0, processedSinceFlush = 0
  const FLUSH_EVERY = 25

  async function runner() {
    while (idx < queue.length) {
      if (shuttingDown) return
      if (Date.now() > deadline) { stoppedForDeadline = true; return }
      const lecture = queue[idx++]
      const bucket = hostBucket(lecture.audioUrl)
      await limiter.acquire(bucket)
      try {
        const result = await migrateWithRetry(lecture, r2, { timeoutMs: 120_000, r2PublicUrl })
        if (result.ok) {
          lecture.audioUrl = result.url
          delete failures[lecture.id]
          migrated++
          console.log(`OK    ${lecture.id} (${(result.bytes / 1e6).toFixed(1)} MB) [${bucket}]`)
        } else {
          const prevAttempts = failures[lecture.id]?.attempts ?? 0
          const attempts = prevAttempts + 1
          failures[lecture.id] = {
            title: lecture.title, audioUrl: lecture.audioUrl, attempts,
            lastError: result.error, lastTriedAt: new Date().toISOString(),
          }
          failedThisRun++
          if (attempts >= ARGS.maxAttempts) newPermanent++
          console.log(`FAIL  ${lecture.id} — ${result.error} (attempt ${attempts}/${ARGS.maxAttempts})`)
        }
      } finally {
        limiter.release(bucket)
      }
      dirty = true
      processedSinceFlush++
      if (processedSinceFlush >= FLUSH_EVERY) { flush(); processedSinceFlush = 0 }
    }
  }

  await Promise.all(Array.from({ length: ARGS.concurrency }, runner))
  if (dirty) flush()

  const finalCounts = currentCounts()
  console.log(`\nRun summary: ${migrated} migrated, ${failedThisRun} failed this run (${newPermanent} newly permanent), stoppedForDeadline=${stoppedForDeadline}`)
  console.log(`Overall: ${finalCounts.onR2}/${allLectures.length} on R2. Remaining eligible: ${finalCounts.remainingEligible}. Permanently failed (needs manual fix): ${finalCounts.permanentlyFailed}.`)
}

main().catch((e) => { console.error('migrate-remote-to-r2 failed:', e); process.exit(1) })
