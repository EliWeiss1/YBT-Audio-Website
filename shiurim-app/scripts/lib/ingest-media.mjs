// =============================================================================
// ingest-media.mjs — source-agnostic helpers shared by the file-based ingest
// workers (scripts/drive-sync.mjs, scripts/dropbox-sync.mjs).
//
// Everything here is downstream of "get the file bytes + metadata": transcode to
// mp3, upload to R2, POST the shared /api/ingest-complete endpoint (which runs the
// SAME categorizer / pending_lectures / flag path as the Zoom email pipeline), the
// service-role Supabase client, and the per-run summary email. The only per-source
// differences are the `source` tag on the POST and the heading/subject on the email,
// both passed in by the caller.
//
// Env is read lazily inside each function (not at module load) so a caller can call
// dotenv `config()` after importing this module without an ordering hazard.
// =============================================================================
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { parseBuffer } from 'music-metadata'
import { Resend } from 'resend'
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

// INGEST_DRY_RUN=true → a full run (download + transcode) but no persistent writes.
export const writesOff = () => process.env.INGEST_DRY_RUN === 'true'

// Only set in the GitHub workflow; default to production so a local backfill works too.
const ingestCompleteUrl = () => process.env.INGEST_COMPLETE_URL || 'https://ybtshiurim.org/api/ingest-complete'
const r2PublicUrl = () => (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
const encodeKey = (k) => k.split('/').map(encodeURIComponent).join('/')

// ── media ────────────────────────────────────────────────────────────────────
export async function getDuration(buf, mimeType) {
  try {
    const meta = await parseBuffer(buf, { mimeType })
    return Math.round(meta.format.duration ?? 0)
  } catch { return 0 }
}

// Transcode a non-mp3 audio buffer to mp3 (ffmpeg). Returns { buf, duration } and throws
// if the converted duration drifts > 5s from the source (corrupt/partial conversion).
export async function toMp3(srcBuf, srcName) {
  const ext = (srcName.split('.').pop() || 'm4a').toLowerCase()
  if (ext === 'mp3') return { buf: srcBuf, duration: await getDuration(srcBuf, 'audio/mpeg') }

  const dir = await mkdtemp(join(tmpdir(), 'ingest-'))
  try {
    const inPath = join(dir, `in.${ext}`)
    const outPath = join(dir, 'out.mp3')
    await writeFile(inPath, srcBuf)
    await execFileAsync('ffmpeg', ['-y', '-i', inPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '3', outPath])
    const buf = await readFile(outPath)
    const origDur = await getDuration(srcBuf, 'audio/mp4')
    const duration = await getDuration(buf, 'audio/mpeg')
    const drift = Math.abs(origDur - duration)
    if (drift > 5) throw new Error(`duration drift ${drift}s (orig=${origDur}, conv=${duration})`)
    return { buf, duration }
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

// ── R2 upload ──────────────────────────────────────────────────────────────────
export function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
}

export async function uploadToR2(r2, key, buf) {
  const bucket = process.env.R2_BUCKET_NAME
  if (writesOff()) {
    console.log(`  [DRY RUN] would upload ${(buf.length / 1e6).toFixed(1)} MB → r2://${bucket}/${key}`)
    return `DRY_RUN/${key}`
  }
  await r2.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: 'audio/mpeg' }))
  const url = `${r2PublicUrl()}/${encodeKey(key)}`
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' })
  if (!head.ok) throw new Error(`uploaded object not reachable (HTTP ${head.status})`)
  return url
}

// ── shared ingest-complete POST ──────────────────────────────────────────────────
// Runs the SAME categorize → pending_lectures → flag path as the Zoom pipeline.
// `source` tags the origin ('drive' | 'dropbox'). deferDeploy/suppressNotify are always
// true — the worker fires a single deploy + one summary email for the whole batch.
export async function postToIngestComplete(payload, { source }) {
  if (writesOff()) {
    console.log('  [DRY RUN] would POST ingest-complete:', payload.lectureId, payload.title)
    return { ok: true, flagged: false }
  }
  const res = await fetch(ingestCompleteUrl(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ingest-secret': process.env.INGEST_SECRET },
    body: JSON.stringify({ ...payload, source, suppressNotify: true, deferDeploy: true }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`ingest-complete ${res.status}: ${JSON.stringify(body)}`)
  return { ok: true, flagged: !!body.flagged, nodePath: body.nodePath }
}

// ── Supabase (service role) ──────────────────────────────────────────────────────
export function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

// ── per-run summary email ────────────────────────────────────────────────────────
// `heading` (H2) and `subjectPrefix` are passed by the caller so the Drive and Dropbox
// workers can share one implementation.
export async function sendSummary({ added, flagged, parseFailed, errored, heading, subjectPrefix }) {
  if (added.length === 0 && parseFailed.length === 0 && errored.length === 0) {
    console.log('Nothing new this run — skipping summary email.')
    return
  }
  const key = process.env.RESEND_API_KEY
  const to = process.env.ADMIN_EMAIL || 'eliisaweiss@gmail.com'
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const list = (items, fmt) => items.length ? `<ul>${items.map(i => `<li>${esc(fmt(i))}</li>`).join('')}</ul>` : ''

  const parts = [`${added.length} added`]
  if (flagged.length) parts.push(`${flagged.length} flagged`)
  if (parseFailed.length) parts.push(`${parseFailed.length} unparseable`)
  if (errored.length) parts.push(`${errored.length} errored`)

  const html = `
    <h2>${esc(heading)}</h2>
    <p>${parts.join(', ')}.</p>
    ${flagged.length ? `<h3>Needs categorization review (see /admin/flags)</h3>${list(flagged, i => `${i.speaker} — ${i.title}`)}` : ''}
    ${parseFailed.length ? `<h3>Could not parse filename</h3>${list(parseFailed, i => `${i.name} — ${i.reason}`)}` : ''}
    ${errored.length ? `<h3>Errored (will retry next run)</h3>${list(errored, i => `${i.name} — ${i.error}`)}` : ''}
  `
  if (!key) { console.log('No RESEND_API_KEY set — skipping summary email. Summary was:\n', parts.join(', ')); return }
  try {
    const { error } = await new Resend(key).emails.send({ from: 'ingest@noreply.ybt.org', to, subject: `${subjectPrefix} ${parts.join(', ')}`, html })
    if (error) console.error(`Summary email rejected by Resend: ${JSON.stringify(error)} (verify the sending domain?)`)
    else console.log(`Summary email sent to ${to}.`)
  } catch (e) {
    console.error(`Summary email failed: ${e.message}`)
  }
}
