// =============================================================================
// dropbox-sync.mjs — Dropbox → shiurim ingest worker.
//
// Fourth ingest mechanism (see CLAUDE.md), a sibling of the Google Drive daily sync
// (scripts/drive-sync.mjs) — same downstream path, different source. A single rabbi's
// recordings land in a Dropbox folder; each file's NAME (minus extension) IS the shiur
// title (no date, no speaker embedded). The speaker is fixed per folder in
// data/dropbox-folders.json; the date falls back to the file's Dropbox client_modified
// timestamp. For every file it hasn't already ingested this worker:
//
//   1. list the configured Dropbox folder(s) recursively (Dropbox API, refresh-token auth).
//      A folder can be read via a shared-link URL (data/dropbox-folders.json `shareLink`),
//      which uses no storage quota and needs no mount — the way to read someone else's
//      folder, or one bigger than your plan, on a free account.
//   2. skip files already recorded status='done' in Supabase `dropbox_ingest_log`
//   3. title = filename, speaker = folder config, date = Dropbox client_modified
//   4. download the bytes, transcode → mp3 (ffmpeg), duration + drift check
//   5. upload to R2, then POST /api/ingest-complete WITHOUT a category pin — so it runs
//      the SAME whole-tree categorizer / pending_lectures / flag path as the Zoom pipeline
//   6. one Vercel deploy for the whole batch + one Resend summary email
//
// Flags: --max N (cap files this run), --path <dropbox path> (limit to one config folder),
//        --dry-run (list + parse + print only; no download/upload/POST/db writes).
// Env: DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN, R2_*, INGEST_COMPLETE_URL,
//      INGEST_SECRET, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//      VERCEL_DEPLOY_HOOK_URL, RESEND_API_KEY, ADMIN_EMAIL, INGEST_DRY_RUN.
// =============================================================================
import { config } from 'dotenv'
import { Dropbox } from 'dropbox'
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import { speakerSlug } from './lib/drive-filename.mjs'
import {
  toMp3, r2Client, uploadToR2, supabase, postToIngestComplete, sendSummary, writesOff,
} from './lib/ingest-media.mjs'

config({ path: '.env.local' }) // local dev; a no-op in CI where env comes from the workflow

// ── CLI flags ────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { max: Infinity, path: null, dryRun: false, seedBaseline: false }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--max') out.max = parseInt(argv[++i], 10)
    else if (argv[i] === '--path') out.path = argv[++i]
    else if (argv[i] === '--dry-run') out.dryRun = true
    else if (argv[i] === '--seed-baseline') out.seedBaseline = true
  }
  return out
}
const ARGS = parseArgs(process.argv.slice(2))
const WRITES_OFF = writesOff() // full run, but no persistent writes

const { VERCEL_DEPLOY_HOOK_URL } = process.env

// ── config (resolved relative to this file, so cwd doesn't matter) ─────────────
const readJson = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'))
const FOLDERS = readJson('../data/dropbox-folders.json')

const AUDIO_NAME_RE = /\.(m4a|mp4|mp3|mpga|wav|aac|mov|m4v)$/i

// A share link is a read-capability URL, so it's kept OUT of git: the real link lives in
// DROPBOX_SHARE_LINK (.env.local locally, a GitHub secret in CI). A per-folder `shareLinkEnv`
// key can name a different var when there are multiple folders. The committed config carries
// only a placeholder; a genuine http(s) URL there still wins (handy for a quick local one-off).
function resolveShareLink(folder) {
  const v = folder.shareLink
  if (v && /^https?:\/\//.test(v) && !v.includes('REPLACE_ME')) return v
  return process.env[folder.shareLinkEnv || 'DROPBOX_SHARE_LINK'] || undefined
}

// ── Dropbox ────────────────────────────────────────────────────────────────────
// Access tokens expire in ~4h, so authenticate with the app key/secret + a long-lived
// refresh token; the SDK mints a fresh access token per run.
function dropboxClient() {
  const { DROPBOX_APP_KEY, DROPBOX_APP_SECRET, DROPBOX_REFRESH_TOKEN } = process.env
  if (!DROPBOX_APP_KEY || !DROPBOX_APP_SECRET || !DROPBOX_REFRESH_TOKEN) {
    throw new Error('DROPBOX_APP_KEY, DROPBOX_APP_SECRET and DROPBOX_REFRESH_TOKEN must all be set')
  }
  return new Dropbox({
    clientId: DROPBOX_APP_KEY,
    clientSecret: DROPBOX_APP_SECRET,
    refreshToken: DROPBOX_REFRESH_TOKEN,
    fetch, // Node 20 global fetch
  })
}

// List every audio/video file under a Dropbox location. Two modes:
//   - shareLink set → read the folder through a shared-link URL. This does NOT mount the
//     folder in the authenticating account, so it uses ZERO storage quota — the way to read
//     a folder bigger than your plan (or someone else's folder) on a free account. Recurses
//     manually because list_folder's `recursive` flag isn't honored with `shared_link`.
//   - else → read a folder mounted in the authenticating account (path-based, recursive).
//     '' = the app-folder root for an App-folder-scoped app; '/Sub/Folder' otherwise.
async function listAudioFiles(dbx, { path, shareLink }) {
  const files = []
  const pushFile = (e) => {
    if (e['.tag'] === 'file' && AUDIO_NAME_RE.test(e.name)) {
      files.push({
        id: e.id || e.path_lower,          // stable Dropbox id ("id:..."); path is the fallback key
        name: e.name,
        path: e.path_lower,                // path within the link / account, for content ops
        clientModified: e.client_modified, // ISO; the recording's timestamp
      })
    }
  }

  if (shareLink) {
    // Walk each folder level explicitly (recursive isn't supported with shared_link).
    const walk = async (sub) => {
      let res = await dbx.filesListFolder({ path: sub, shared_link: { url: shareLink } })
      const handle = async (entries) => {
        for (const e of entries) {
          if (e['.tag'] === 'folder') await walk(e.path_lower)
          else pushFile(e)
        }
      }
      await handle(res.result.entries)
      while (res.result.has_more) {
        res = await dbx.filesListFolderContinue({ cursor: res.result.cursor })
        await handle(res.result.entries)
      }
    }
    await walk(path || '') // '' = the shared link's own root
    return files
  }

  let res = await dbx.filesListFolder({ path: path || '', recursive: true, limit: 2000 })
  for (const e of res.result.entries) pushFile(e)
  while (res.result.has_more) {
    res = await dbx.filesListFolderContinue({ cursor: res.result.cursor })
    for (const e of res.result.entries) pushFile(e)
  }
  return files
}

async function downloadFile(dbx, { path, shareLink }) {
  // Shared-link download (no mount/quota) vs. mounted-folder download.
  const res = shareLink
    ? await dbx.sharingGetSharedLinkFile({ url: shareLink, path })
    : await dbx.filesDownload({ path })
  // Node SDK attaches the bytes as `fileBinary` (Buffer); browser builds use `fileBlob`.
  const bin = res.result.fileBinary
  return Buffer.isBuffer(bin) ? bin : Buffer.from(bin)
}

// ── title parse ────────────────────────────────────────────────────────────────
// The filename IS the title — strip only the extension and trim. Kept verbatim
// (hyphens/underscores preserved) since the rabbi names the file with the real title.
function titleFromName(name) {
  return String(name).replace(/\.[^.]+$/, '').replace(/\s+/g, ' ').trim()
}

// Auto-generated names carry no meaningful title, so a real shiur (named by the rabbi)
// should never match. Skips things like "August 25, 2024 at 9_56_09 AM" and "Oct 18 2015".
// Anchored, so "May 31 Shabbos 23a ..." (a real title starting with a date) does NOT match.
const AUTO_TIMESTAMP_TITLE_RE = /^[A-Za-z]{3,9}\.? \d{1,2},? \d{4}( at \d{1,2}[_.:]\d{2}([_.:]\d{2})? ?[AP]M)?$/
function looksLikeAutoTimestampTitle(title) {
  return AUTO_TIMESTAMP_TITLE_RE.test(String(title).trim())
}

// ── Supabase dedup log (dropbox_ingest_log) ─────────────────────────────────────
async function loadDoneFileIds(sb) {
  const done = new Set()
  // 'done' = ingested; 'baseline' = pre-existing file we deliberately never ingest (see
  // --seed-baseline). Both are skipped. 'error'/'parse_failed' rows are retried next run.
  const { data, error } = await sb.from('dropbox_ingest_log').select('file_id').in('status', ['done', 'baseline'])
  if (error) throw new Error(`dropbox_ingest_log read failed: ${error.message}`)
  for (const r of data ?? []) done.add(r.file_id)
  return done
}

// One-time: mark every file CURRENTLY in the folder as 'baseline' (seen, never ingest),
// without downloading anything. After this, only files added later (new Dropbox ids) ingest.
async function seedBaseline(sb, all) {
  const seen = await loadDoneFileIds(sb) // don't clobber real 'done' rows
  const fresh = all.filter(f => !seen.has(f.id))
  console.log(`Baseline: ${fresh.length} file(s) to mark pre-existing (${all.length - fresh.length} already logged).`)
  if (ARGS.dryRun || WRITES_OFF) { console.log('[dry-run] no writes — re-run without --dry-run to seed.'); return }
  let n = 0
  for (const f of fresh) {
    const { error } = await sb.from('dropbox_ingest_log').upsert({
      file_id: f.id, file_name: f.name, title: titleFromName(f.name), speaker: f.speaker,
      status: 'baseline', ingested_at: new Date().toISOString(),
    }, { onConflict: 'file_id' })
    if (error) console.error(`  WARN: baseline write failed for ${f.name}: ${error.message}`)
    else n++
  }
  console.log(`Baseline seeded: ${n} row(s) marked status='baseline'. Future uploads (new ids) will ingest normally.`)
}

async function logResult(sb, row) {
  if (WRITES_OFF) return
  const { error } = await sb.from('dropbox_ingest_log').upsert({ ...row, ingested_at: new Date().toISOString() }, { onConflict: 'file_id' })
  if (error) console.error(`  WARN: dropbox_ingest_log write failed for ${row.file_id}: ${error.message}`)
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

  const dbx = dropboxClient()
  const folders = ARGS.path != null ? FOLDERS.filter(f => (f.path ?? '') === ARGS.path) : FOLDERS
  if (!folders.length) throw new Error(`no matching folder (--path "${ARGS.path}")`)

  // 1-2. list every audio file across all folders, then drop already-ingested ones.
  //      Carry each folder's fixed speaker + id prefix down onto its files.
  let all = []
  for (const folder of folders) {
    const shareLink = resolveShareLink(folder)
    const where = shareLink ? '(shared link)' : (folder.path || '(app root)')
    console.log(`Listing ${where} → speaker "${folder.speaker}" ...`)
    const files = await listAudioFiles(dbx, { path: folder.path ?? '', shareLink })
    for (const f of files) all.push({ ...f, speaker: folder.speaker, idPrefix: folder.idPrefix || 'DBX', shareLink })
  }
  console.log(`Found ${all.length} audio/video file(s) across ${folders.length} folder(s).`)

  const sb = supabase()

  // One-time baseline seeding: mark everything currently present as seen, ingest nothing.
  if (ARGS.seedBaseline) { await seedBaseline(sb, all); return }

  const done = ARGS.dryRun ? new Set() : await loadDoneFileIds(sb)
  let todo = all.filter(f => !done.has(f.id))

  console.log(`${todo.length} new (skipped ${all.length - todo.length} already-ingested).`)
  if (Number.isFinite(ARGS.max)) todo = todo.slice(0, ARGS.max)

  const r2 = ARGS.dryRun ? null : r2Client()
  const added = [], flagged = [], parseFailed = [], errored = []

  for (const file of todo) {
    const title = titleFromName(file.name)
    if (!title) {
      const reason = 'empty title after stripping extension'
      console.log(`SKIP  ${file.name} — ${reason}`)
      parseFailed.push({ ...file, reason })
      await logResult(sb, { file_id: file.id, file_name: file.name, status: 'parse_failed', error: reason })
      continue
    }
    if (looksLikeAutoTimestampTitle(title)) {
      const reason = 'auto-timestamp filename, no meaningful title — rename it in Dropbox to ingest'
      console.log(`SKIP  ${file.name} — ${reason}`)
      parseFailed.push({ ...file, reason })
      await logResult(sb, { file_id: file.id, file_name: file.name, status: 'parse_failed', error: reason })
      continue
    }
    if (!file.clientModified) {
      const reason = 'no client_modified timestamp on the Dropbox file'
      console.log(`SKIP  ${file.name} — ${reason}`)
      parseFailed.push({ ...file, reason })
      await logResult(sb, { file_id: file.id, file_name: file.name, status: 'parse_failed', error: reason })
      continue
    }
    const date = file.clientModified.slice(0, 10) // ISO → YYYY-MM-DD
    console.log(`FILE  ${file.name}\n      → ${date} | ${file.speaker} | "${title}"`)

    if (ARGS.dryRun) { added.push({ ...file, title, date }); continue }

    try {
      const raw = await downloadFile(dbx, { path: file.path, shareLink: file.shareLink })
      const { buf, duration } = await toMp3(raw, file.name)
      const lectureId = `${file.idPrefix}-${date.replace(/-/g, '')}-${randomBytes(3).toString('hex')}`
      const r2Key = `dropbox/${speakerSlug(file.speaker)}/${lectureId}.mp3`
      const publicUrl = await uploadToR2(r2, r2Key, buf)
      // No `category` → /api/ingest-complete runs the whole-tree categorizer + /admin/flags,
      // exactly like the Zoom email pipeline.
      const res = await postToIngestComplete({
        lectureId, title, rabbi: file.speaker, description: '', date, publicUrl, duration,
      }, { source: 'dropbox' })
      await logResult(sb, {
        file_id: file.id, lecture_id: lectureId, file_name: file.name,
        title, speaker: file.speaker, node_path: res.nodePath ?? null, status: 'done',
      })
      added.push({ ...file, lectureId, title, flagged: res.flagged })
      if (res.flagged) flagged.push({ ...file, speaker: file.speaker, title })
      console.log(`  OK  ${lectureId} → ${(res.nodePath || []).join(' / ') || '(uncategorized)'}${res.flagged ? ' [flagged]' : ''} — ${(buf.length / 1e6).toFixed(1)} MB, ${duration}s`)
    } catch (e) {
      console.error(`  ERROR ${file.name}: ${e.message}`)
      errored.push({ ...file, error: e.message })
      await logResult(sb, { file_id: file.id, file_name: file.name, speaker: file.speaker, status: 'error', error: e.message })
    }
  }

  // One deploy for the whole batch (server calls were all deferDeploy:true).
  if (!ARGS.dryRun && !WRITES_OFF && added.length && VERCEL_DEPLOY_HOOK_URL) {
    await fetch(VERCEL_DEPLOY_HOOK_URL, { method: 'POST' })
    console.log('Triggered Vercel deploy.')
  }

  console.log(`\nDONE — ${added.length} added, ${flagged.length} flagged, ${parseFailed.length} unparseable, ${errored.length} errored.`)
  if (!ARGS.dryRun && !WRITES_OFF) {
    await sendSummary({ added, flagged, parseFailed, errored, heading: 'Dropbox shiur sync', subjectPrefix: '[Dropbox Sync]' })
  }
}

main().catch((e) => { console.error('dropbox-sync failed:', e); process.exit(1) })
