// Zoom cloud-recording downloader — runs on a GitHub Actions Ubuntu runner.
//
// Zoom cloud recordings the rebbeim forward are passcode-protected; the only way to
// download them without OAuth is to drive the real player in a browser. This script
// opens the /rec/share/ page, waits for the player to mint signed ssrweb.zoom.us .m4a
// URLs, downloads the bytes with the required Referer/Origin, uploads to R2, and POSTs
// the result back to /api/ingest-complete.
//
// A single share link can hold MORE THAN ONE recording (an accidental stop/restart, or
// two shiurim back-to-back — the player shows "Total N Recordings" with a Forward/next
// control). This worker captures every clip and then, based on RECORDINGS_JSON:
//   - merge    → concatenate all clips into one shiur (ffmpeg)
//   - separate → one shiur per clip, titled from the plan's titles
//   - (none)   → 1 clip: single shiur (as before); >1 clip: auto-merge + flag the admin
//
// All inputs come from env (set by the workflow from client_payload) to avoid shell
// command injection from email-derived values.

import { chromium } from 'playwright'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { parseBuffer } from 'music-metadata'
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

const {
  SHARE_URL, LECTURE_ID, TITLE, RABBI, DESCRIPTION, DATE, SENDER_EMAIL, RAW_EMAIL_SNIPPET,
  RECORDINGS_JSON, INGEST_COMPLETE_URL, INGEST_SECRET, DRY_RUN,
} = process.env

// The rebbe's optional merge/separate plan. `toJSON` of an absent field serializes to
// the string "null", so guard against that too.
const plan = RECORDINGS_JSON && RECORDINGS_JSON !== 'null' ? JSON.parse(RECORDINGS_JSON) : null

async function postResult(body) {
  const res = await fetch(INGEST_COMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ingest-secret': INGEST_SECRET },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    console.error(`ingest-complete callback returned ${res.status}: ${await res.text().catch(() => '')}`)
  }
  return res
}

// Poll `cond` until true or the deadline; returns whether it became true.
async function waitUntil(cond, timeoutMs, page, intervalMs = 500) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (cond()) return true
    await page.waitForTimeout(intervalMs)
  }
  return cond()
}

// Read "Total N Recordings" from the player's multi-clip control (video.js renders it
// as ".vjs-multiple-clip-control"). Returns a number or null.
async function readRecordingCount(page) {
  try {
    const el = page.locator('.vjs-multiple-clip-control').first()
    if (await el.count()) {
      const m = ((await el.textContent()) || '').match(/Total\s+(\d+)\s+Recording/i)
      if (m) return parseInt(m[1], 10)
    }
    const body = await page.evaluate(() => document.body?.innerText ?? '')
    const m2 = body.match(/Total\s+(\d+)\s+Recording/i)
    if (m2) return parseInt(m2[1], 10)
  } catch {
    // fall through
  }
  return null
}

// Advance to the next clip. The control is Zoom's video.js "Go Forward to next clip"
// button (aliases below). The controls auto-hide unless the pointer is active, so click
// in-page via .click() to bypass Playwright's visibility/hover actionability checks.
async function clickNext(page) {
  return await page.evaluate(() => {
    const selectors = [
      'button[aria-label="Go Forward to next clip"]',
      'button[aria-label*="next clip" i]',
      'button[aria-label*="forward" i]',
      '.vjs-multiple-clip-control-button.button-next',
      '.vjs-upcoming-link',
    ]
    for (const s of selectors) {
      const el = document.querySelector(s)
      if (el) { el.click(); return true }
    }
    return false
  })
}

// Drive the share page and collect every signed .m4a URL, in play order.
async function collectSignedUrls(page) {
  const found = []
  const seen = new Set()
  page.on('request', (r) => {
    const u = r.url()
    if (/ssrweb\.zoom\.us.*\.m4a/i.test(u) && !seen.has(u)) {
      seen.add(u)
      found.push(u)
    }
  })

  await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await waitUntil(() => found.length >= 1, 30000, page, 500)
  if (found.length === 0) throw new Error('no_signed_url')

  // A multi-recording share renders a ".vjs-multiple-clip-control" ("Total N Recordings").
  // Wait for it before reading the count — it renders a beat after the first clip loads.
  // No such control (single recording) → we're done with the one URL already captured.
  const hasMulti = await page.locator('.vjs-multiple-clip-control').first()
    .waitFor({ state: 'attached', timeout: 8000 }).then(() => true).catch(() => false)
  const total = hasMulti ? (await readRecordingCount(page)) ?? 1 : 1
  console.log(`Share reports ${total} recording(s); first signed URL captured.`)

  // Click through to each remaining clip, waiting for its signed URL after each click.
  let guard = 0
  while (found.length < total && guard < total + 3) {
    guard++
    const before = found.length
    if (!(await clickNext(page))) break
    await waitUntil(() => found.length > before, 10000, page, 500)
    if (found.length === before) break // clicked but no new clip loaded — stop
  }
  return found
}

// Download one signed clip with the Referer/Origin Zoom's CDN requires.
async function fetchClip(ctx, url) {
  const origin = new URL(SHARE_URL).origin // e.g. https://us06web.zoom.us
  const resp = await ctx.request.get(url, {
    headers: { Referer: `${origin}/`, Origin: origin },
  })
  if (!resp.ok()) throw new Error(`audio_fetch_${resp.status()}`)
  return Buffer.from(await resp.body())
}

async function getDuration(buf, mimeType) {
  try {
    const meta = await parseBuffer(buf, { mimeType })
    return Math.round(meta.format.duration ?? 0)
  } catch {
    return 0 // best-effort
  }
}

// Concatenate M4A clips into a single MP3 with ffmpeg (re-encode so clips with slightly
// different params still join cleanly). Returns the merged bytes.
async function mergeClipsToMp3(buffers) {
  const dir = await mkdtemp(join(tmpdir(), 'zoom-merge-'))
  try {
    const files = []
    for (let i = 0; i < buffers.length; i++) {
      const f = join(dir, `clip-${i}.m4a`)
      await writeFile(f, buffers[i])
      files.push(f)
    }
    const listPath = join(dir, 'list.txt')
    // ffmpeg concat demuxer: single-quote paths and escape any quotes.
    await writeFile(listPath, files.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join('\n'))
    const outPath = join(dir, 'merged.mp3')
    await execFileAsync('ffmpeg', [
      '-y', '-f', 'concat', '-safe', '0', '-i', listPath,
      '-c:a', 'libmp3lame', '-q:a', '2', outPath,
    ])
    return await readFile(outPath)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

// Upload bytes to R2 (or skip on a dry run). Returns the public URL.
async function uploadToR2(r2, key, buf) {
  if (DRY_RUN === 'true') {
    console.log(`[DRY RUN] Would upload ${buf.length} bytes to R2 key ${key}`)
    return `DRY_RUN/${key}`
  }
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
    Body: buf,
    ContentType: 'audio/mpeg',
  }))
  return `${process.env.R2_PUBLIC_URL}/${key}`
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  let clips = []
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
    })
    const page = await ctx.newPage()

    const urls = await collectSignedUrls(page)
    console.log(`Captured ${urls.length} signed clip URL(s).`)

    // Download every clip while the authenticated context is still open.
    for (const u of urls) clips.push(await fetchClip(ctx, u))
  } finally {
    if (browser.isConnected()) await browser.close().catch(() => {})
  }

  if (clips.length === 0) throw new Error('no_clips_downloaded')

  // Resolve what to do with the clips.
  //   explicit plan wins; otherwise 1 clip = single, >1 clips = auto-merge (+ flag admin).
  const mode = plan?.mode ?? (clips.length > 1 ? 'merge' : 'single')
  const autoMerged = !plan && clips.length > 1
  const r2 = r2Client()

  const common = {
    rabbi: RABBI, description: DESCRIPTION, date: DATE, senderEmail: SENDER_EMAIL,
    shareUrl: SHARE_URL, rawEmailSnippet: RAW_EMAIL_SNIPPET,
  }

  if (mode === 'pick') {
    // `only N` — keep just the Nth recording, discard the rest. One shiur, line-1 title.
    const n = plan?.index ?? 1
    const idx = n - 1
    if (idx < 0 || idx >= clips.length) {
      throw new Error(`pick_out_of_range: asked for recording ${n} but the share has ${clips.length}`)
    }
    const buf = clips[idx]
    const duration = await getDuration(buf, 'audio/mp4')
    const r2Key = `ingest/${DATE}/${LECTURE_ID}.mp3`
    const publicUrl = await uploadToR2(r2, r2Key, buf)
    await postResult({ ...common, lectureId: LECTURE_ID, title: TITLE, r2Key, publicUrl, duration })
    console.log(`pick: kept recording ${n}/${clips.length} (${buf.length} bytes, ${duration}s).`)
    return
  }

  if (mode === 'separate') {
    // One shiur per clip. Title from the plan; fall back to "<title> (Part N)".
    const titles = Array.isArray(plan?.titles) ? plan.titles : []
    if (titles.length !== clips.length) {
      console.warn(`separate: ${titles.length} title(s) for ${clips.length} clip(s); using positional titles with (Part N) fallback.`)
    }
    for (let i = 0; i < clips.length; i++) {
      const buf = clips[i]
      const lectureId = `${LECTURE_ID}-${i + 1}`
      const r2Key = `ingest/${DATE}/${lectureId}.mp3`
      const publicUrl = await uploadToR2(r2, r2Key, buf)
      const duration = await getDuration(buf, 'audio/mp4')
      await postResult({
        ...common,
        lectureId,
        title: titles[i] || `${TITLE} (Part ${i + 1})`,
        r2Key, publicUrl, duration,
        // Trigger the site rebuild only on the final clip so N shiurim = one deploy.
        deferDeploy: i < clips.length - 1,
      })
      console.log(`separate: uploaded clip ${i + 1}/${clips.length} (${buf.length} bytes, ${duration}s) as ${lectureId}.`)
    }
    return
  }

  // merge / single → one shiur.
  let buf, duration
  if (clips.length > 1) {
    buf = await mergeClipsToMp3(clips)
    duration = await getDuration(buf, 'audio/mpeg')
    console.log(`merge: joined ${clips.length} clips into ${buf.length} bytes, ${duration}s${autoMerged ? ' (auto-merged, no directive)' : ''}.`)
  } else {
    buf = clips[0]
    duration = await getDuration(buf, 'audio/mp4')
  }
  const r2Key = `ingest/${DATE}/${LECTURE_ID}.mp3`
  const publicUrl = await uploadToR2(r2, r2Key, buf)
  await postResult({
    ...common,
    lectureId: LECTURE_ID,
    title: TITLE,
    r2Key, publicUrl, duration,
    // Let the admin know when we merged multiple clips WITHOUT being told to.
    ...(autoMerged ? { autoMerged: true, recordingCount: clips.length } : {}),
  })
  console.log(`Uploaded ${buf.length} bytes to R2 key ${r2Key}, duration ${duration}s.`)
}

main().catch(async (e) => {
  console.error('zoom-browser-ingest failed:', e)
  // Report the failure through /api/ingest-complete so the admin gets the same
  // Resend "FAILED" email as every other pipeline error. If the callback succeeds,
  // drop a marker so the workflow's job-level fallback notifier stays quiet (no
  // duplicate email); if it fails, the marker is absent and the workflow notifies.
  try {
    const res = await postResult({
      lectureId: LECTURE_ID, title: TITLE, rabbi: RABBI, senderEmail: SENDER_EMAIL,
      shareUrl: SHARE_URL, rawEmailSnippet: RAW_EMAIL_SNIPPET, error: String(e),
    })
    if (res && res.ok) await writeFile('.ingest-reported', '1').catch(() => {})
  } catch {
    // Callback unreachable — leave no marker so the workflow fallback fires.
  }
  process.exit(1)
})
