// =============================================================================
// drive-sync.mjs — Google Drive → shiurim ingest worker.
//
// Third ingest mechanism (see CLAUDE.md). Rabbis' Zoom recordings land in shared
// Google Drive folders named `YYYY-MM-DD_<Rabbi>_<Title>.m4a`. This worker (run daily
// by .github/workflows/drive-ingest.yml, and once locally for the backfill) does, for
// every file it hasn't already ingested:
//
//   1. list the configured root folders recursively (Drive API, service account)
//   2. skip files already recorded status='done' in Supabase `drive_ingest_log`
//   3. parse the filename → { date, speaker, title }
//   4. download the bytes, transcode m4a → mp3 (ffmpeg), duration + drift check
//   5. upload to R2, then POST /api/ingest-complete — which runs the SAME categorizer /
//      pending_lectures / flag path as the Zoom email pipeline (source:'drive')
//   6. one Vercel deploy for the whole batch + one Resend summary email
//
// Flags: --max N (cap files this run), --root <id> (limit to one root),
//        --dry-run (list + parse + print only; no download/upload/POST/db writes).
// Env: GOOGLE_SERVICE_ACCOUNT_JSON, R2_*, INGEST_COMPLETE_URL, INGEST_SECRET,
//      NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VERCEL_DEPLOY_HOOK_URL,
//      RESEND_API_KEY, ADMIN_EMAIL, INGEST_DRY_RUN.
// =============================================================================
import { config } from 'dotenv'
import { google } from 'googleapis'
import { createClient } from '@supabase/supabase-js'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { parseBuffer } from 'music-metadata'
import { Resend } from 'resend'
import { readFileSync } from 'node:fs'
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { randomBytes } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  parseDriveFilename, resolveSpeaker, speakerSlug,
  titleLooksMisordered, dedupePreferAudio, isVideoFile,
} from './lib/drive-filename.mjs'

config({ path: '.env.local' }) // local dev; a no-op in CI where env comes from the workflow

const execFileAsync = promisify(execFile)

// ── CLI flags ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { max: Infinity, root: null, dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max') out.max = parseInt(argv[++i], 10)
    else if (argv[i] === '--root') out.root = argv[++i]
    else if (argv[i] === '--dry-run') out.dryRun = true
  }
  return out
}
const ARGS = parseArgs(process.argv.slice(2))
const WRITES_OFF = process.env.INGEST_DRY_RUN === 'true' // full run, but no persistent writes

const { INGEST_SECRET, R2_BUCKET_NAME, VERCEL_DEPLOY_HOOK_URL } = process.env
// Only set in the GitHub workflow; default to production so the local backfill works too.
const INGEST_COMPLETE_URL = process.env.INGEST_COMPLETE_URL || 'https://ybtshiurim.org/api/ingest-complete'
const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '')
const encodeKey = (k) => k.split('/').map(encodeURIComponent).join('/')

// ── config (resolved relative to this file, so cwd doesn't matter) ─────────────
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
const ROOTS = readJson('../data/drive-folders.json')
const SPEAKER_MAP = Object.fromEntries(
  Object.entries(readJson('../data/drive-speaker-map.json')).filter(([k]) => !k.startsWith('_')),
)

// ── Google Drive ───────────────────────────────────────────────────────────────
function driveClient() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON is not set')
  // Accept raw JSON or base64-encoded JSON.
  let credentials
  try { credentials = JSON.parse(raw) }
  catch { credentials = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  })
  return google.drive({ version: 'v3', auth })
}

const FOLDER_MIME = 'application/vnd.google-apps.folder'
const AUDIO_NAME_RE = /\.(m4a|mp4|mp3|mpga|wav|aac|mov|m4v)$/i

// Resolve a root folder id from its name (for data/drive-folders.json entries with no id).
async function resolveFolderId(drive, label) {
  const res = await drive.files.list({
    q: `mimeType = '${FOLDER_MIME}' and name = '${label.replace(/'/g, "\\'")}' and trashed = false`,
    fields: 'files(id, name)',
    pageSize: 10,
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  })
  const hits = res.data.files ?? []
  if (hits.length === 1) return hits[0].id
  if (hits.length === 0) throw new Error(`no shared folder named "${label}" — check the name or add its id`)
  throw new Error(`ambiguous: ${hits.length} shared folders named "${label}" — pin the id in data/drive-folders.json`)
}

// Recurse a folder, collecting audio files with the rabbi-named folder that contains them
// and the root's category pin (carried down so every file knows where its folder maps to).
async function listAudioFiles(drive, folderId, folderLabel, category, aliases) {
  const files = []
  let pageToken
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) {
      if (f.mimeType === FOLDER_MIME) {
        files.push(...await listAudioFiles(drive, f.id, f.name, category, aliases))
      } else if (AUDIO_NAME_RE.test(f.name)) {
        files.push({ id: f.id, name: f.name, folder: folderLabel, category, aliases })
      }
    }
    pageToken = res.data.nextPageToken
  } while (pageToken)
  return files
}

async function downloadFile(drive, fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'arraybuffer' },
  )
  return Buffer.from(res.data)
}

// ── media ────────────────────────────────────────────────────────────────────
async function getDuration(buf, mimeType) {
  try {
    const meta = await parseBuffer(buf, { mimeType })
    return Math.round(meta.format.duration ?? 0)
  } catch { return 0 }
}

// Transcode a non-mp3 audio buffer to mp3 (ffmpeg). Returns { buf, duration } and throws
// if the converted duration drifts > 5s from the source (corrupt/partial conversion).
async function toMp3(srcBuf, srcName) {
  const ext = (srcName.split('.').pop() || 'm4a').toLowerCase()
  if (ext === 'mp3') return { buf: srcBuf, duration: await getDuration(srcBuf, 'audio/mpeg') }

  const dir = await mkdtemp(join(tmpdir(), 'drive-ingest-'))
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

async function uploadToR2(r2, key, buf) {
  if (WRITES_OFF) {
    console.log(`  [DRY RUN] would upload ${(buf.length / 1e6).toFixed(1)} MB → r2://${R2_BUCKET_NAME}/${key}`)
    return `DRY_RUN/${key}`
  }
  await r2.send(new PutObjectCommand({ Bucket: R2_BUCKET_NAME, Key: key, Body: buf, ContentType: 'audio/mpeg' }))
  const url = `${R2_PUBLIC_URL}/${encodeKey(key)}`
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' })
  if (!head.ok) throw new Error(`uploaded object not reachable (HTTP ${head.status})`)
  return url
}

// POST to the shared ingest-complete endpoint (categorize → pending_lectures → flag).
// deferDeploy is always true — this worker fires a single deploy for the whole batch.
async function postToIngestComplete(payload) {
  if (WRITES_OFF) {
    console.log('  [DRY RUN] would POST ingest-complete:', payload.lectureId, payload.title)
    return { ok: true, flagged: false }
  }
  const res = await fetch(INGEST_COMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-ingest-secret': INGEST_SECRET },
    body: JSON.stringify({ ...payload, source: 'drive', suppressNotify: true, deferDeploy: true }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`ingest-complete ${res.status}: ${JSON.stringify(body)}`)
  return { ok: true, flagged: !!body.flagged, nodePath: body.nodePath }
}

// ── Supabase dedup log ─────────────────────────────────────────────────────────
function supabase() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
}

async function loadDoneFileIds(sb) {
  const done = new Set()
  // Only 'done' rows are skipped — 'error'/'parse_failed' rows are retried next run.
  const { data, error } = await sb.from('drive_ingest_log').select('file_id').eq('status', 'done')
  if (error) throw new Error(`drive_ingest_log read failed: ${error.message}`)
  for (const r of data ?? []) done.add(r.file_id)
  return done
}

async function logResult(sb, row) {
  if (WRITES_OFF) return
  const { error } = await sb.from('drive_ingest_log').upsert({ ...row, ingested_at: new Date().toISOString() }, { onConflict: 'file_id' })
  if (error) console.error(`  WARN: drive_ingest_log write failed for ${row.file_id}: ${error.message}`)
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  // Fail fast (before any download) if the ingest path is missing credentials. --dry-run
  // and INGEST_DRY_RUN never upload/POST, so they don't need these.
  if (!ARGS.dryRun && !WRITES_OFF) {
    const missing = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME', 'R2_PUBLIC_URL', 'INGEST_SECRET']
      .filter(k => !process.env[k])
    if (missing.length) {
      throw new Error(`Missing env for ingest: ${missing.join(', ')}. Add them to .env.local, or use --dry-run to test parsing only.`)
    }
  }

  const drive = driveClient()
  const roots = ARGS.root ? ROOTS.filter(r => r.id === ARGS.root) : ROOTS
  if (!roots.length) throw new Error(`no matching root folder (--root ${ARGS.root})`)

  // 1-2. list every audio file across all roots, then drop already-ingested ones.
  let all = []
  for (const root of roots) {
    const id = root.id || await resolveFolderId(drive, root.label)
    if (!root.id) console.log(`Resolved "${root.label}" → ${id} (add this id to data/drive-folders.json to pin it)`)
    console.log(`Listing "${root.label}" (${id})${root.category ? ` → pinned to ${root.category}` : ' → full-tree AI'} ...`)
    all.push(...await listAudioFiles(drive, id, root.label, root.category, root.aliases))
  }
  console.log(`Found ${all.length} audio/video file(s) across ${roots.length} root(s).`)

  const sb = supabase()
  const done = ARGS.dryRun ? new Set() : await loadDoneFileIds(sb)
  let todo = all.filter(f => !done.has(f.id))

  // Drop video files that duplicate an audio recording of the same shiur (same folder+date).
  const { kept, dropped } = dedupePreferAudio(todo)
  for (const f of dropped) console.log(`DUP   ${f.name} — skipped (audio version exists)`)
  todo = kept

  console.log(`${todo.length} new (skipped ${all.length - todo.length} already-ingested/duplicate).`)
  if (Number.isFinite(ARGS.max)) todo = todo.slice(0, ARGS.max)

  const r2 = ARGS.dryRun ? null : r2Client()
  const added = [], flagged = [], parseFailed = [], errored = []

  for (const file of todo) {
    const parsed = parseDriveFilename(file.name)
    if (!parsed.ok) {
      console.log(`SKIP  ${file.name} — ${parsed.reason}`)
      parseFailed.push({ ...file, reason: parsed.reason })
      await logResult(sb, { file_id: file.id, file_name: file.name, status: 'parse_failed', error: parsed.reason })
      continue
    }
    const speaker = resolveSpeaker(parsed.rabbiToken, file.folder, SPEAKER_MAP)
    // A title equal to the speaker means the filename is likely date_Title_Speaker (misordered).
    if (titleLooksMisordered(parsed.title, speaker)) {
      const reason = `title "${parsed.title}" equals speaker — filename likely misordered (expected date_Speaker_Title)`
      console.log(`SKIP  ${file.name} — ${reason}`)
      parseFailed.push({ ...file, reason })
      await logResult(sb, { file_id: file.id, file_name: file.name, speaker, status: 'parse_failed', error: reason })
      continue
    }
    console.log(`FILE  ${file.name}\n      → ${parsed.date} | ${speaker} | "${parsed.title}"  [folder: ${file.folder}]`)

    if (ARGS.dryRun) { added.push({ ...file, ...parsed, speaker }); continue }

    try {
      const raw = await downloadFile(drive, file.id)
      const { buf, duration } = await toMp3(raw, file.name)
      const lectureId = `MASORET-${parsed.date.replace(/-/g, '')}-${randomBytes(3).toString('hex')}`
      const r2Key = `drive/${speakerSlug(speaker)}/${lectureId}.mp3`
      const publicUrl = await uploadToR2(r2, r2Key, buf)
      const res = await postToIngestComplete({
        lectureId, title: parsed.title, rabbi: speaker, description: '', date: parsed.date, publicUrl, duration,
        category: file.category, aliases: file.aliases,
      })
      await logResult(sb, {
        file_id: file.id, lecture_id: lectureId, file_name: file.name,
        title: parsed.title, speaker, node_path: res.nodePath ?? null, status: 'done',
      })
      added.push({ ...file, lectureId, speaker, flagged: res.flagged })
      if (res.flagged) flagged.push({ ...file, speaker, title: parsed.title })
      console.log(`  OK  ${lectureId} → ${(res.nodePath || []).join(' / ') || '(uncategorized)'}${res.flagged ? ' [flagged]' : ''} — ${(buf.length / 1e6).toFixed(1)} MB, ${duration}s`)
    } catch (e) {
      console.error(`  ERROR ${file.name}: ${e.message}`)
      errored.push({ ...file, error: e.message })
      await logResult(sb, { file_id: file.id, file_name: file.name, speaker, status: 'error', error: e.message })
    }
  }

  // One deploy for the whole batch (server calls were all deferDeploy:true).
  if (!ARGS.dryRun && !WRITES_OFF && added.length && VERCEL_DEPLOY_HOOK_URL) {
    await fetch(VERCEL_DEPLOY_HOOK_URL, { method: 'POST' })
    console.log('Triggered Vercel deploy.')
  }

  console.log(`\nDONE — ${added.length} added, ${flagged.length} flagged, ${parseFailed.length} unparseable, ${errored.length} errored.`)
  if (!ARGS.dryRun && !WRITES_OFF) await sendSummary({ added, flagged, parseFailed, errored })
}

// ── summary email ──────────────────────────────────────────────────────────────
async function sendSummary({ added, flagged, parseFailed, errored }) {
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
    <h2>Google Drive shiur sync</h2>
    <p>${parts.join(', ')}.</p>
    ${flagged.length ? `<h3>Needs categorization review (see /admin/flags)</h3>${list(flagged, i => `${i.speaker} — ${i.title}`)}` : ''}
    ${parseFailed.length ? `<h3>Could not parse filename (rename in Drive to <code>YYYY-MM-DD_Rabbi_Title</code>)</h3>${list(parseFailed, i => `${i.name} — ${i.reason}`)}` : ''}
    ${errored.length ? `<h3>Errored (will retry next run)</h3>${list(errored, i => `${i.name} — ${i.error}`)}` : ''}
  `
  if (!key) { console.log('No RESEND_API_KEY set — skipping summary email. Summary was:\n', parts.join(', ')); return }
  try {
    const { error } = await new Resend(key).emails.send({ from: 'ingest@noreply.ybt.org', to, subject: `[Drive Sync] ${parts.join(', ')}`, html })
    if (error) console.error(`Summary email rejected by Resend: ${JSON.stringify(error)} (verify the sending domain?)`)
    else console.log(`Summary email sent to ${to}.`)
  } catch (e) {
    console.error(`Summary email failed: ${e.message}`)
  }
}

main().catch((e) => { console.error('drive-sync failed:', e); process.exit(1) })
