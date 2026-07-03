// Zoom cloud-recording downloader — runs on a GitHub Actions Ubuntu runner.
//
// Zoom cloud recordings the rebbeim forward are passcode-protected; the only way to
// download them without OAuth is to drive the real player in a browser. This script
// opens the /rec/share/ page, waits for the player to mint a signed ssrweb.zoom.us
// .m4a URL, downloads the bytes with the required Referer/Origin, uploads to R2, and
// POSTs the result back to /api/ingest-complete.
//
// All inputs come from env (set by the workflow from client_payload) to avoid shell
// command injection from email-derived values.

import { chromium } from 'playwright'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { parseBuffer } from 'music-metadata'
import { writeFile } from 'node:fs/promises'

const {
  SHARE_URL, LECTURE_ID, TITLE, RABBI, DESCRIPTION, DATE, SENDER_EMAIL,
  INGEST_COMPLETE_URL, INGEST_SECRET, DRY_RUN,
} = process.env

const r2Key = `ingest/${DATE}/${LECTURE_ID}.mp3`

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

async function main() {
  const browser = await chromium.launch({ headless: true })
  let signed = null
  try {
    const ctx = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      acceptDownloads: true,
    })
    const page = await ctx.newPage()

    // The player fetches the signed audio URL as a background request; capture it.
    page.on('request', (r) => {
      const u = r.url()
      if (/ssrweb\.zoom\.us.*\.m4a/i.test(u) && !signed) signed = u
    })

    await page.goto(SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 45000 })

    // Poll for up to ~30s for the player to mint the signed URL.
    const deadline = Date.now() + 30000
    while (!signed && Date.now() < deadline) {
      await page.waitForTimeout(1000)
    }
    if (!signed) throw new Error('no_signed_url')

    // Fetch the signed audio with the Referer/Origin Zoom's CDN requires.
    const resp = await ctx.request.get(signed, {
      headers: { Referer: 'https://us06web.zoom.us/', Origin: 'https://us06web.zoom.us' },
    })
    if (!resp.ok()) throw new Error(`audio_fetch_${resp.status()}`)
    const buf = Buffer.from(await resp.body())
    await browser.close()

    let duration = 0
    try {
      const meta = await parseBuffer(buf, { mimeType: 'audio/mp4' })
      duration = Math.round(meta.format.duration ?? 0)
    } catch {
      // Duration is best-effort; 0 is acceptable.
    }

    if (DRY_RUN === 'true') {
      await postResult({
        lectureId: LECTURE_ID, title: TITLE, rabbi: RABBI, description: DESCRIPTION,
        date: DATE, senderEmail: SENDER_EMAIL, r2Key, publicUrl: `DRY_RUN/${r2Key}`, duration,
      })
      console.log(`[DRY RUN] Captured ${buf.length} bytes, duration ${duration}s; skipped R2 upload.`)
      return
    }

    const r2 = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    })
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: r2Key,
      Body: buf,
      ContentType: 'audio/mpeg',
    }))

    await postResult({
      lectureId: LECTURE_ID, title: TITLE, rabbi: RABBI, description: DESCRIPTION,
      date: DATE, senderEmail: SENDER_EMAIL, r2Key,
      publicUrl: `${process.env.R2_PUBLIC_URL}/${r2Key}`, duration,
    })
    console.log(`Uploaded ${buf.length} bytes to R2 key ${r2Key}, duration ${duration}s.`)
  } finally {
    // Ensure the browser is closed even on the throw path before browser.close() above.
    if (browser.isConnected()) await browser.close().catch(() => {})
  }
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
      shareUrl: SHARE_URL, error: String(e),
    })
    if (res && res.ok) await writeFile('.ingest-reported', '1').catch(() => {})
  } catch {
    // Callback unreachable — leave no marker so the workflow fallback fires.
  }
  process.exit(1)
})
