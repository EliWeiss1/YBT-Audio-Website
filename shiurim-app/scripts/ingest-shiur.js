#!/usr/bin/env node
// =============================================================================
// ingest-shiur.js — reusable per-shiur worker for the Schneeweiss migration.
//
// For a given shiurID + placements[] + tags[] it does the FULL chain from
// scratch (this is what ingest-one.js did NOT do — that one reused a
// pre-converted pilot MP3 and never downloaded/converted):
//
//   1. fetch metadata fresh from the classic.yutorah.org search API
//   2. download media from download.yutorah.org
//   3. MP4 -> MP3 convert (ffmpeg -vn) + ffprobe drift check (<= 5s);
//      skip convert when the source is already MP3
//   4. upload to R2 Schneeweiss/{shiurID}.mp3 + HEAD-verify the public URL
//   5. insert the lecture object (audioUrl = R2 URL, duration = ffprobe) into
//      every node in placements[] (dedup-by-id, newest-first unshift)
//   7. delete the local MP3 on success
//
// Used two ways:
//   - CLI (this file): loads data/lectures.json, backs it up, ingests ONE
//     shiur, writes the file, runs generate-node-data.mjs, verifies. (Part A)
//   - module: `require('./ingest-shiur').ingestShiur(...)` operates on an
//     in-memory data object and does NOT write/generate — the bulk runner
//     (migrate-schneeweiss.js, Part B) batches those itself.
//
// CLI usage (defaults to the Part A video test 1179161 -> nach-mishlei):
//   node scripts/ingest-shiur.js
//   node scripts/ingest-shiur.js --id 1179161 --placements nach-mishlei --tags mishlei
// =============================================================================
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const API_BASE = 'https://classic.yutorah.org/search/_get_search_results.cfm';
const DL_HOST = 'https://download.yutorah.org';
const SPEAKER = 'Rabbi Matt Schneeweiss';
const LECTURES_PATH = path.join('data', 'lectures.json');
const MEDIA_DIR = path.join('scripts', 'pilot-output', 'migrate-media');

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const encodeKey = (k) => k.split('/').map(encodeURIComponent).join('/');

// ── a stage-tagged error so the bulk runner can record WHERE a shiur failed ──
class StageError extends Error {
  constructor(stage, message) { super(message); this.stage = stage; }
}

function makeR2() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

// ── helpers reused from the pilot scripts ────────────────────────────────────
const arr = (v) => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);

function findNode(categories, id) {
  let hit = null;
  (function walk(ns) {
    for (const n of ns) {
      if (n.id === id) hit = n;
      if (n.children) walk(n.children);
    }
  })(categories);
  return hit;
}

function ffprobeDuration(file) {
  const out = execFileSync('ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8' });
  const j = JSON.parse(out);
  const d = parseFloat(j.format && j.format.duration);
  return Number.isFinite(d) ? d : null;
}

async function downloadTo(url, dest) {
  const r = await fetch(url, { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// reuse pilot-scrape.js fetchShiur logic (pick the doc with matching shiurid)
async function fetchShiur(id) {
  const r = await fetch(`${API_BASE}?search_query=${id}&page=1`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const docs = j.response?.docs || [];
  const d = docs.find((x) => String(x.shiurid) === String(id)) || docs[0];
  if (!d) throw new Error(`not found (numFound=${j.response?.numFound})`);
  return d;
}

// =============================================================================
// ingestShiur — steps 1-5 + 7 against an in-memory `data` object.
// Returns { status:'inserted'|'duplicate', audioUrl, duration, title, date,
//           placements, insertedInto[], driftSeconds, mediaType }.
// Throws StageError on any failure (stage tells the caller where).
// =============================================================================
async function ingestShiur({ shiurID, placements, tags = [], data, r2, log = () => {} }) {
  shiurID = String(shiurID);
  const id = `YBT-${shiurID}`;
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  // ── 1. fetch metadata fresh ──
  let doc;
  try {
    doc = await fetchShiur(shiurID);
  } catch (e) { throw new StageError('fetch', e.message); }

  const title = doc.shiurtitle || '';
  const description = doc.shiurdescription || '';
  const date = (doc.shiurdate || '').substring(0, 10);
  const shiururl = doc.shiururl || '';
  if (!shiururl) throw new StageError('fetch', 'no shiururl in API doc');
  const ext = (shiururl.split('.').pop() || '').toLowerCase();
  const mediaType = ext === 'mp3' ? 'mp3' : (ext === 'mp4' ? 'mp4' : ext || 'mp3');
  const mediaUrl = shiururl.startsWith('http') ? shiururl : DL_HOST + shiururl;
  log(`[${shiurID}] "${title}" (${mediaType}) ${mediaUrl}`);

  // ── 2. download ──
  const rawPath = path.join(MEDIA_DIR, `${shiurID}.${mediaType}`);
  try {
    const bytes = await downloadTo(mediaUrl, rawPath);
    log(`[${shiurID}] downloaded ${(bytes / 1e6).toFixed(1)} MB`);
  } catch (e) { throw new StageError('download', e.message); }

  // ── 3. convert MP4 -> MP3 (skip when already MP3) + drift check ──
  let mp3Path = rawPath;
  let driftSeconds = null;
  let origDur;
  try {
    origDur = ffprobeDuration(rawPath);
  } catch (e) { throw new StageError('probe', `unreadable/no audio stream in source file (likely corrupt or empty at the source): ${e.message}`); }
  if (origDur == null && mediaType !== 'mp4') {
    throw new StageError('probe', 'source file has no detectable duration/audio stream (likely corrupt or empty at the source)');
  }
  let finalDur = origDur;

  if (mediaType === 'mp4') {
    mp3Path = path.join(MEDIA_DIR, `${shiurID}.mp3`);
    try {
      log(`[${shiurID}] converting MP4 -> MP3 ...`);
      execFileSync('ffmpeg',
        ['-y', '-i', rawPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '3', mp3Path],
        { stdio: 'ignore' });
    } catch (e) { throw new StageError('convert', e.message); }
    finalDur = ffprobeDuration(mp3Path);
    driftSeconds = (origDur != null && finalDur != null)
      ? +(Math.abs(origDur - finalDur)).toFixed(3) : null;
    log(`[${shiurID}] orig=${origDur}s conv=${finalDur}s drift=${driftSeconds}s`);
    if (driftSeconds == null || driftSeconds > 5) {
      // keep BOTH files for inspection — do not delete the MP4
      throw new StageError('drift>5s',
        `duration drift ${driftSeconds}s (orig=${origDur}, conv=${finalDur}); kept MP4+MP3 for inspection`);
    }
    fs.unlinkSync(rawPath); // drift ok -> drop the intermediate MP4
    log(`[${shiurID}] validated (drift <= 5s); deleted intermediate MP4`);
  }
  const duration = finalDur != null ? Math.round(finalDur) : null;

  // ── 4. upload to R2 + HEAD-verify ──
  const r2Key = `Schneeweiss/${shiurID}.mp3`;
  let audioUrl;
  try {
    const body = fs.readFileSync(mp3Path);
    log(`[${shiurID}] uploading ${(body.length / 1e6).toFixed(2)} MB -> r2://${process.env.R2_BUCKET_NAME}/${r2Key}`);
    await r2.send(new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME, Key: r2Key, Body: body, ContentType: 'audio/mpeg',
    }));
    audioUrl = `${R2_PUBLIC_URL}/${encodeKey(r2Key)}`;
  } catch (e) { throw new StageError('upload', e.message); }

  try {
    const head = await fetch(audioUrl, { method: 'HEAD', redirect: 'follow' });
    log(`[${shiurID}] HEAD ${audioUrl} -> ${head.status} (${head.headers.get('content-length')} bytes)`);
    if (!head.ok) throw new Error(`uploaded object not reachable (HTTP ${head.status})`);
  } catch (e) { throw new StageError('verify', e.message); }

  // ── 5. insert into every placement node (dedup-by-id) ──
  const lecture = { id, title, audioUrl, duration, description, speaker: SPEAKER, date, tags };
  const insertedInto = [];
  let anyInserted = false;
  try {
    for (const nodeId of placements) {
      const node = findNode(data.categories, nodeId);
      if (!node) throw new Error(`placement node not found: ${nodeId}`);
      if (!Array.isArray(node.lectures)) throw new Error(`${nodeId} is not a leaf (no lectures[])`);
      if (node.lectures.some((l) => l.id === id)) { log(`[${shiurID}] ${nodeId}: already present`); continue; }
      node.lectures.unshift(lecture); // newest-first
      insertedInto.push(nodeId);
      anyInserted = true;
      log(`[${shiurID}] inserted into ${nodeId} (now ${node.lectures.length})`);
    }
  } catch (e) { throw new StageError('insert', e.message); }

  // ── 7. delete the local MP3 on success ──
  try { if (fs.existsSync(mp3Path)) fs.unlinkSync(mp3Path); } catch { /* non-fatal */ }

  return {
    status: anyInserted ? 'inserted' : 'duplicate',
    id, audioUrl, duration, title, date, r2Key,
    placements, insertedInto, driftSeconds, mediaType,
  };
}

// =============================================================================
// CLI (Part A): ingest exactly one shiur end-to-end, then generate + verify.
// =============================================================================
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--id') out.id = argv[++i];
    else if (argv[i] === '--placements') out.placements = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
    else if (argv[i] === '--tags') out.tags = argv[++i].split(',').map(s => s.trim()).filter(Boolean);
  }
  return out;
}

async function runCli() {
  const a = parseArgs(process.argv.slice(2));
  const shiurID = a.id || '1179161';                       // Part A video test
  const placements = a.placements || ['nach-mishlei'];
  const tags = a.tags || ['mishlei'];

  console.log(`\n=== ingest-shiur (CLI) — ${shiurID} -> [${placements.join(', ')}] ===\n`);

  // backup data/lectures.json (same convention as ingest-one.js)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = LECTURES_PATH.replace('.json', `.backup-ingest-${stamp}.json`);
  fs.copyFileSync(LECTURES_PATH, backup);
  console.log(`[backup] ${LECTURES_PATH} -> ${backup}`);

  const data = JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf8'));
  const r2 = makeR2();

  const res = await ingestShiur({ shiurID, placements, tags, data, r2, log: (m) => console.log('  ' + m) });
  console.log(`\n[result] ${res.status} | duration=${res.duration}s | ${res.audioUrl}`);

  fs.writeFileSync(LECTURES_PATH, JSON.stringify(data, null, 2));
  console.log(`[write] ${LECTURES_PATH}`);

  console.log('[generate] running generate-node-data.mjs ...');
  execFileSync('node', ['scripts/generate-node-data.mjs'], { stdio: 'inherit' });

  // verify it landed in the generated files
  let allIn = true;
  for (const nodeId of placements) {
    const nf = JSON.parse(fs.readFileSync(path.join('public', 'lectures-data', `${nodeId}.json`), 'utf8'));
    const inNode = (nf.lectures || []).some((l) => l.id === res.id);
    if (!inNode) allIn = false;
    console.log(`[verify] ${nodeId}.json: ${inNode ? 'YES' : 'NO'}`);
  }
  const catalog = JSON.parse(fs.readFileSync(path.join('public', 'lectures-data', 'catalog.json'), 'utf8'));
  const catEntry = catalog.find((l) => l.id === res.id);
  console.log(`[verify] catalog.json: ${catEntry ? 'YES' : 'NO'}${catEntry ? ` (breadcrumb: ${catEntry.breadcrumb.join(' > ')})` : ''}`);

  console.log(`\n${allIn && catEntry ? 'OK' : 'WARN'} — done (no commit/deploy). Backup: ${backup}`);
}

module.exports = { ingestShiur, fetchShiur, findNode, ffprobeDuration, makeR2, StageError, SPEAKER, MEDIA_DIR };

if (require.main === module) {
  runCli().catch((e) => { console.error('FATAL', e.stage ? `[${e.stage}] ` : '', e); process.exit(1); });
}
