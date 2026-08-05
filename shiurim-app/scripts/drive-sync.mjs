// =============================================================================
// drive-sync.mjs — Google Drive → shiurim ingest worker.
//
// Third ingest mechanism (see CLAUDE.md). Rabbis' Zoom recordings land in shared
// Google Drive folders, most named `YYYY-MM-DD_<Rabbi>_<Title>.m4a` (parseDriveFilename)
// but a root can opt into a different convention via `filenameFormat` in
// data/drive-folders.json — e.g. "masoret-suffix" for Rabbi Weiss's
// `<Rabbi> - <Title> - Masoret <M-D-YY>.m4a` files (parseMasoretFilename). This worker
// (run daily by .github/workflows/drive-ingest.yml, and once locally for the backfill)
// does, for every file it hasn't already ingested:
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
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import {
  parseDriveFilename, parseMasoretFilename, resolveSpeaker, speakerSlug,
  titleLooksMisordered, dedupePreferAudio, isVideoFile,
} from './lib/drive-filename.mjs'
import {
  toMp3, r2Client, uploadToR2, supabase, postToIngestComplete, sendSummary, writesOff,
} from './lib/ingest-media.mjs'

config({ path: '.env.local' }) // local dev; a no-op in CI where env comes from the workflow

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
const WRITES_OFF = writesOff() // full run, but no persistent writes

const { VERCEL_DEPLOY_HOOK_URL } = process.env

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
// `filenameFormat` selects which parser drive-filename.mjs uses for this root (default:
// canonical date_rabbi_title); it's carried down the same way as category/aliases.
async function listAudioFiles(drive, folderId, folderLabel, category, aliases, filenameFormat) {
  const files = []
  let pageToken
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id, name, mimeType, createdTime)',
      pageSize: 1000,
      pageToken,
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    })
    for (const f of res.data.files ?? []) {
      if (f.mimeType === FOLDER_MIME) {
        files.push(...await listAudioFiles(drive, f.id, f.name, category, aliases, filenameFormat))
      } else if (AUDIO_NAME_RE.test(f.name)) {
        files.push({ id: f.id, name: f.name, folder: folderLabel, category, aliases, filenameFormat, createdTime: f.createdTime })
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

// ── Supabase dedup log (drive_ingest_log) ──────────────────────────────────────
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
    all.push(...await listAudioFiles(drive, id, root.label, root.category, root.aliases, root.filenameFormat))
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
    const parseFn = file.filenameFormat === 'masoret-suffix' ? parseMasoretFilename : parseDriveFilename
    let parsed = parseFn(file.name)
    if (!parsed.ok) {
      console.log(`SKIP  ${file.name} — ${parsed.reason}`)
      parseFailed.push({ ...file, reason: parsed.reason })
      await logResult(sb, { file_id: file.id, file_name: file.name, status: 'parse_failed', error: parsed.reason })
      continue
    }
    // Some Masoret filenames omit the date entirely — fall back to Drive's creation time.
    if (!parsed.date) {
      if (!file.createdTime) {
        const reason = 'no date in filename and no Drive createdTime available'
        console.log(`SKIP  ${file.name} — ${reason}`)
        parseFailed.push({ ...file, reason })
        await logResult(sb, { file_id: file.id, file_name: file.name, status: 'parse_failed', error: reason })
        continue
      }
      parsed = { ...parsed, date: file.createdTime.slice(0, 10) }
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
      const title = `${parsed.title} (Masoret)`
      const res = await postToIngestComplete({
        lectureId, title, rabbi: speaker, description: '', date: parsed.date, publicUrl, duration,
        category: file.category, aliases: file.aliases,
      }, { source: 'drive' })
      await logResult(sb, {
        file_id: file.id, lecture_id: lectureId, file_name: file.name,
        title, speaker, node_path: res.nodePath ?? null, status: 'done',
      })
      added.push({ ...file, lectureId, speaker, flagged: res.flagged })
      if (res.flagged) flagged.push({ ...file, speaker, title })
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
  if (!ARGS.dryRun && !WRITES_OFF) {
    await sendSummary({ added, flagged, parseFailed, errored, heading: 'Google Drive shiur sync', subjectPrefix: '[Drive Sync]' })
  }
}

main().catch((e) => { console.error('drive-sync failed:', e); process.exit(1) })
