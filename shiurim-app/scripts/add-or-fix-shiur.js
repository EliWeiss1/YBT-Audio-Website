#!/usr/bin/env node
// =============================================================================
// add-or-fix-shiur.mjs — the mutating half of the add-fix-shiur skill.
//
// Mirrors the shape of scripts/ingest-shiur.js (backup -> fetch/download/convert
// -> upload to R2 + HEAD-verify -> mutate data/lectures.json in memory -> write
// -> regenerate node data -> verify placement), generalized to also handle:
//   - a locally-supplied audio file instead of a YUTorah id
//   - a generic direct-download audio URL
//   - "fix" mode: locate an existing lecture by id anywhere in the tree, patch
//     whichever fields changed, optionally replace its audio (deleting the old
//     R2 object if it was ours), optionally move it to different node(s).
//
// This script does NOT categorize (see categorize-shiur.mjs) and does NOT
// touch git — the caller decides node placement ahead of time (after
// confirming low-confidence categorization with the user) and handles
// commit/push itself, so the diff stays visible before anything is pushed.
//
// Usage — add a brand-new shiur:
//   node add-or-fix-shiur.mjs --mode add \
//     --node-path gemarah,gemarah-berachot \
//     --yutorah-id 927564
//   node add-or-fix-shiur.mjs --mode add \
//     --node-path gemarah,gemarah-berachot \
//     --title "..." --speaker "Rabbi X" --date 2026-07-20 \
//     --audio-file "C:\path\to\local.mp3" --pdf-file "C:\path\to\sources.pdf"
//
// Usage — fix an existing shiur:
//   node add-or-fix-shiur.mjs --mode fix --id YBT-927564 --title "Corrected title"
//   node add-or-fix-shiur.mjs --mode fix --id MISC-03 --audio-file "C:\new.mp3"
//   node add-or-fix-shiur.mjs --mode fix --id MISC-03 --node-path chumash,bereishit,bereishit-noach
//   node add-or-fix-shiur.mjs --mode fix --id MISC-03 --pdf-file "C:\sources.pdf"
//   node add-or-fix-shiur.mjs --mode fix --id MISC-03 --remove-pdf
//
// A shiur can optionally carry a "sources" PDF alongside its audio, attached
// via --pdf-file (local path) or --pdf-url (remote URL) on either mode, and
// removed via --remove-pdf on --mode fix. Stored at R2 key
// <treepath>/<id>-sources.pdf, mirroring the audio's <treepath>/<id>.mp3.
//
// All modes support --dry-run (no R2 writes/deletes, no file writes — prints
// the plan instead).
// =============================================================================
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const API_BASE = 'https://classic.yutorah.org/search/_get_search_results.cfm';
const DL_HOST = 'https://download.yutorah.org';
const LECTURES_PATH = path.join('data', 'lectures.json');
const MEDIA_DIR = path.join('scripts', 'tmp-add-fix-shiur');

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const encodeKey = (k) => k.split('/').map(encodeURIComponent).join('/');

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

// ── tree helpers ─────────────────────────────────────────────────────────────
function findNode(categories, id) {
  let hit = null;
  (function walk(ns) {
    for (const n of ns) {
      if (n.id === id) hit = n;
      if (n.children) walk(n.children);
      if (hit) return;
    }
  })(categories);
  return hit;
}

// root->leaf id chain for a node id, used to mirror the tree in the R2 key.
function findPathToNode(categories, targetId) {
  let result = null;
  (function walk(ns, trail) {
    for (const n of ns) {
      const next = [...trail, n.id];
      if (n.id === targetId) { result = next; return; }
      if (n.children) walk(n.children, next);
      if (result) return;
    }
  })(categories, []);
  return result;
}

// every {node, index} where node.lectures[index].id === lectureId, anywhere in the tree.
function findAllOccurrences(categories, lectureId) {
  const hits = [];
  (function walk(ns) {
    for (const n of ns) {
      if (Array.isArray(n.lectures)) {
        n.lectures.forEach((l, i) => { if (l.id === lectureId) hits.push({ node: n, index: i }); });
      }
      if (n.children) walk(n.children);
    }
  })(categories);
  return hits;
}

function nextMiscId(categories) {
  let max = 0;
  (function walk(ns) {
    for (const n of ns) {
      if (Array.isArray(n.lectures)) {
        for (const l of n.lectures) {
          const m = /^MISC-(\d+)$/.exec(l.id);
          if (m) max = Math.max(max, parseInt(m[1], 10));
        }
      }
      if (n.children) walk(n.children);
    }
  })(categories);
  return `MISC-${String(max + 1).padStart(2, '0')}`;
}

// ── audio helpers (shared by add/fix) ────────────────────────────────────────
function ffprobeDuration(file) {
  const out = execFileSync('ffprobe',
    ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file],
    { encoding: 'utf8' });
  const j = JSON.parse(out);
  const d = parseFloat(j.format && j.format.duration);
  return Number.isFinite(d) ? d : null;
}

// Raw shiururl/media values from source APIs are plain text, not URL-encoded —
// a literal '#' (seen in real ybt.org filenames like "...Bootcamp_#1_...mp3")
// gets parsed as a fragment delimiter and silently truncates the path,
// producing a 404 on an otherwise-valid file. Encoding is idempotent: it only
// touches bare '#'/space characters, which can't appear in an already-encoded URL.
function safeUrl(url) {
  return url.replace(/#/g, '%23').replace(/ /g, '%20');
}

async function downloadTo(url, dest) {
  const r = await fetch(safeUrl(url), { redirect: 'follow' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

// The classic.yutorah.org search API defaults to organizationid:301 (the
// Schneeweiss-migration org) unless an explicit organizationID param is
// passed — a shiur hosted under a different affiliate (e.g. YBT's own org
// 367, whose lecture_iframe.cfm URLs embed `Affiliate~CFM~367~...`) returns
// numFound:0 without it. Try unscoped first (covers the common org-301
// case), then retry with the org id recovered from the URL/flag if given.
async function fetchYutorahDoc(shiurID, orgId) {
  async function search(withOrg) {
    const orgParam = withOrg ? `&organizationID=${withOrg}` : '';
    const r = await fetch(`${API_BASE}?search_query=${shiurID}&page=1${orgParam}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const j = await r.json();
    const docs = j.response?.docs || [];
    return docs.find((x) => String(x.shiurid) === String(shiurID)) || docs[0] || null;
  }
  let d = await search(null);
  if (!d && orgId) d = await search(orgId);
  if (!d) throw new Error(`not found on classic.yutorah.org (shiurid=${shiurID}${orgId ? `, organizationID=${orgId}` : ''})`);
  return d;
}

function extractYutorahId(idOrUrl) {
  const m = String(idOrUrl).match(/lecture_iframe\.cfm\/(\d+)/) || String(idOrUrl).match(/^(\d+)$/);
  if (!m) throw new Error(`could not extract a YUTorah shiur id from: ${idOrUrl}`);
  return m[1];
}

// Pulls the affiliate/organization id out of a lecture_iframe.cfm URL's
// `Affiliate~CFM~<id>~...` fragment, e.g. present on ybt.org-hosted shiurim.
function extractYutorahOrgId(idOrUrl) {
  const m = String(idOrUrl).match(/Affiliate~CFM~(\d+)~/);
  return m ? m[1] : null;
}

// Convert whatever we downloaded/were given into a local MP3, applying the
// same MP4->MP3 + <=5s drift-check safety net as ingest-shiur.js.
function ensureMp3(rawPath, ext, tag) {
  if (ext === 'mp3') return { mp3Path: rawPath, duration: ffprobeDuration(rawPath), driftSeconds: null };
  const mp3Path = rawPath.replace(new RegExp(`\\.${ext}$`), '.mp3');
  const origDur = ffprobeDuration(rawPath);
  execFileSync('ffmpeg', ['-y', '-i', rawPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '3', mp3Path], { stdio: 'ignore' });
  const finalDur = ffprobeDuration(mp3Path);
  const driftSeconds = (origDur != null && finalDur != null) ? +(Math.abs(origDur - finalDur)).toFixed(3) : null;
  if (driftSeconds == null || driftSeconds > 5) {
    throw new StageError('convert', `[${tag}] duration drift ${driftSeconds}s (orig=${origDur}, conv=${finalDur}); kept both files for inspection`);
  }
  fs.unlinkSync(rawPath);
  return { mp3Path, duration: finalDur, driftSeconds };
}

// Resolves audio + (for yutorah source) metadata. Returns
// { mp3Path, duration, driftSeconds, meta: {title,description,date,speaker,shiururl}|null }
async function resolveAudio(opts) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  if (opts.yutorahId || opts.yutorahUrl) {
    const shiurID = opts.yutorahId ? String(opts.yutorahId) : extractYutorahId(opts.yutorahUrl);
    const orgId = opts.yutorahOrg || (opts.yutorahUrl ? extractYutorahOrgId(opts.yutorahUrl) : null);
    const doc = await fetchYutorahDoc(shiurID, orgId);
    const shiururl = doc.shiururl || '';
    if (!shiururl) throw new StageError('fetch', 'no shiururl in YUTorah API doc');
    const ext = (shiururl.split('.').pop() || 'mp3').toLowerCase();
    const mediaUrl = shiururl.startsWith('http') ? shiururl : DL_HOST + shiururl;
    const rawPath = path.join(MEDIA_DIR, `yutorah-${shiurID}.${ext}`);
    await downloadTo(mediaUrl, rawPath);
    const { mp3Path, duration, driftSeconds } = ensureMp3(rawPath, ext === 'mp4' ? 'mp4' : 'mp3', shiurID);
    return {
      mp3Path, duration: duration != null ? Math.round(duration) : null, driftSeconds,
      meta: {
        shiurID,
        title: doc.shiurtitle || '',
        description: doc.shiurdescription || '',
        date: (doc.shiurdate || '').substring(0, 10),
        speaker: doc.teacherfullname || '',
      },
    };
  }

  if (opts.audioUrl) {
    const ext = (opts.audioUrl.split('.').pop() || 'mp3').split('?')[0].toLowerCase();
    const rawPath = path.join(MEDIA_DIR, `remote-${Date.now()}.${ext}`);
    await downloadTo(opts.audioUrl, rawPath);
    const { mp3Path, duration, driftSeconds } = ensureMp3(rawPath, ext === 'mp3' ? 'mp3' : ext, 'audio-url');
    return { mp3Path, duration: duration != null ? Math.round(duration) : null, driftSeconds, meta: null };
  }

  if (opts.audioFile) {
    if (!fs.existsSync(opts.audioFile)) throw new StageError('audio-file', `not found: ${opts.audioFile}`);
    const ext = (path.extname(opts.audioFile).slice(1) || 'mp3').toLowerCase();
    const rawPath = path.join(MEDIA_DIR, `local-${Date.now()}.${ext}`);
    fs.copyFileSync(opts.audioFile, rawPath);
    const { mp3Path, duration, driftSeconds } = ensureMp3(rawPath, ext, 'audio-file');
    return { mp3Path, duration: duration != null ? Math.round(duration) : null, driftSeconds, meta: null };
  }

  return null; // no new audio requested (fix-metadata-only path)
}

async function uploadFileToR2(r2, filePath, r2Key, contentType, dryRun) {
  const url = `${R2_PUBLIC_URL}/${encodeKey(r2Key)}`;
  if (dryRun) return { url, uploaded: false };
  const body = fs.readFileSync(filePath);
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: r2Key, Body: body, ContentType: contentType }));
  const head = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  if (!head.ok) throw new StageError('verify', `uploaded object not reachable (HTTP ${head.status})`);
  return { url, uploaded: true };
}

async function deleteOldR2Object(r2, oldUrl, dryRun) {
  if (!oldUrl || !R2_PUBLIC_URL || !oldUrl.startsWith(R2_PUBLIC_URL)) return { deleted: false, reason: 'not_our_bucket' };
  const key = decodeURIComponent(oldUrl.slice(R2_PUBLIC_URL.length + 1));
  if (dryRun) return { deleted: false, reason: 'dry_run', key };
  await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key }));
  return { deleted: true, key };
}

// Resolves a local or remote sources PDF into a temp file. Returns
// { pdfPath } or null if no PDF was requested.
async function resolvePdf(opts) {
  fs.mkdirSync(MEDIA_DIR, { recursive: true });

  let pdfPath = null;
  if (opts.pdfFile) {
    if (!fs.existsSync(opts.pdfFile)) throw new StageError('pdf-file', `not found: ${opts.pdfFile}`);
    pdfPath = path.join(MEDIA_DIR, `pdf-${Date.now()}.pdf`);
    fs.copyFileSync(opts.pdfFile, pdfPath);
  } else if (opts.pdfUrl) {
    pdfPath = path.join(MEDIA_DIR, `pdf-${Date.now()}.pdf`);
    await downloadTo(opts.pdfUrl, pdfPath);
  } else {
    return null;
  }

  // Cheap sanity check — a bad --pdf-url can 200 with an HTML error page.
  const head = Buffer.alloc(5);
  const fd = fs.openSync(pdfPath, 'r');
  fs.readSync(fd, head, 0, 5, 0);
  fs.closeSync(fd);
  if (head.toString('utf8') !== '%PDF-') {
    fs.unlinkSync(pdfPath);
    throw new StageError('pdf-file', 'downloaded/copied file is not a PDF (missing %PDF- header)');
  }

  return { pdfPath };
}

// ── CLI ───────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { tags: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--mode') out.mode = val();
    else if (a === '--id') out.id = val();
    else if (a === '--title') out.title = val();
    else if (a === '--description') out.description = val();
    else if (a === '--speaker') out.speaker = val();
    else if (a === '--date') out.date = val();
    else if (a === '--tags') out.tags = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--node-path') out.nodePath = val().split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--yutorah-id') out.yutorahId = val();
    else if (a === '--yutorah-url') out.yutorahUrl = val();
    else if (a === '--yutorah-org') out.yutorahOrg = val();
    else if (a === '--audio-file') out.audioFile = val();
    else if (a === '--audio-url') out.audioUrl = val();
    else if (a === '--pdf-file') out.pdfFile = val();
    else if (a === '--pdf-url') out.pdfUrl = val();
    else if (a === '--remove-pdf') out.removePdf = true;
    else if (a === '--dry-run') out.dryRun = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}

async function runAdd(args, data, r2) {
  if (!args.nodePath || !args.nodePath.length) throw new Error('--node-path is required for --mode add');
  const audio = await resolveAudio(args);
  if (!audio) throw new Error('add requires one of --yutorah-id, --yutorah-url, --audio-file, --audio-url');

  const title = args.title || audio.meta?.title;
  const description = args.description ?? audio.meta?.description ?? '';
  const speaker = args.speaker || audio.meta?.speaker;
  const date = args.date || audio.meta?.date || new Date().toISOString().slice(0, 10);
  if (!title) throw new Error('no title (pass --title, or source from --yutorah-id/--yutorah-url)');
  if (!speaker) throw new Error('no speaker (pass --speaker, or source from --yutorah-id/--yutorah-url)');

  const id = args.id || (audio.meta?.shiurID ? `YBT-${audio.meta.shiurID}` : nextMiscId(data.categories));

  const leafId = args.nodePath[args.nodePath.length - 1];
  const treePath = findPathToNode(data.categories, leafId) || args.nodePath;
  const r2Key = `${treePath.join('/')}/${id}.mp3`;
  const { url: audioUrl } = await uploadFileToR2(r2, audio.mp3Path, r2Key, 'audio/mpeg', args.dryRun);

  const pdf = await resolvePdf(args);
  let pdfUrl, pdfR2Key;
  if (pdf) {
    pdfR2Key = `${treePath.join('/')}/${id}-sources.pdf`;
    ({ url: pdfUrl } = await uploadFileToR2(r2, pdf.pdfPath, pdfR2Key, 'application/pdf', args.dryRun));
  }

  const lecture = { id, title, audioUrl, duration: audio.duration, description, speaker, date, tags: args.tags, ...(pdfUrl ? { pdfUrl } : {}) };
  const insertedInto = [];
  for (const nodeId of args.nodePath) {
    const node = findNode(data.categories, nodeId);
    if (!node) throw new Error(`placement node not found: ${nodeId}`);
    if (!Array.isArray(node.lectures)) throw new Error(`${nodeId} is not a leaf (no lectures[])`);
    if (node.lectures.some((l) => l.id === id)) continue;
    if (!args.dryRun) node.lectures.unshift(lecture);
    insertedInto.push(nodeId);
  }

  if (!args.dryRun && fs.existsSync(audio.mp3Path)) fs.unlinkSync(audio.mp3Path);
  if (!args.dryRun && pdf && fs.existsSync(pdf.pdfPath)) fs.unlinkSync(pdf.pdfPath);
  return { status: 'added', id, title, audioUrl, r2Key, duration: audio.duration, driftSeconds: audio.driftSeconds, pdfUrl, pdfR2Key, insertedInto, lecture: args.dryRun ? lecture : undefined };
}

async function runFix(args, data, r2) {
  if (!args.id) throw new Error('--id is required for --mode fix');
  const occurrences = findAllOccurrences(data.categories, args.id);
  if (!occurrences.length) throw new Error(`no lecture found with id ${args.id}`);

  const result = { status: 'fixed', id: args.id, changed: [] };
  const template = occurrences[0].node.lectures[occurrences[0].index];
  const oldAudioUrl = template.audioUrl;
  const oldPdfUrl = template.pdfUrl;

  // metadata patches, applied to every occurrence (cross-listed copies share the id)
  for (const field of ['title', 'description', 'speaker', 'date']) {
    if (args[field] !== undefined) {
      result.changed.push(field);
      if (!args.dryRun) for (const { node, index } of occurrences) node.lectures[index][field] = args[field];
    }
  }
  if (args.tags && args.tags.length) {
    result.changed.push('tags');
    if (!args.dryRun) for (const { node, index } of occurrences) node.lectures[index].tags = args.tags;
  }

  // audio replacement
  const audio = await resolveAudio(args);
  if (audio) {
    result.changed.push('audio');
    const currentLeaf = args.nodePath ? args.nodePath[args.nodePath.length - 1] : occurrences[0].node.id;
    const treePath = findPathToNode(data.categories, currentLeaf) || [currentLeaf];
    const r2Key = `${treePath.join('/')}/${args.id}.mp3`;
    const { url: audioUrl } = await uploadFileToR2(r2, audio.mp3Path, r2Key, 'audio/mpeg', args.dryRun);
    result.newAudioUrl = audioUrl;
    result.newDuration = audio.duration;
    result.driftSeconds = audio.driftSeconds;
    if (!args.dryRun) {
      for (const { node, index } of occurrences) {
        node.lectures[index].audioUrl = audioUrl;
        node.lectures[index].duration = audio.duration;
      }
      if (fs.existsSync(audio.mp3Path)) fs.unlinkSync(audio.mp3Path);
    }
    result.oldAudioDeletion = await deleteOldR2Object(r2, oldAudioUrl, args.dryRun);
  }

  // sources PDF: remove, or add/replace
  if (args.removePdf) {
    result.changed.push('pdf-removed');
    result.pdfDeletion = await deleteOldR2Object(r2, oldPdfUrl, args.dryRun);
    if (!args.dryRun) for (const { node, index } of occurrences) delete node.lectures[index].pdfUrl;
  } else {
    const pdf = await resolvePdf(args);
    if (pdf) {
      result.changed.push('pdf');
      const currentLeaf = args.nodePath ? args.nodePath[args.nodePath.length - 1] : occurrences[0].node.id;
      const treePath = findPathToNode(data.categories, currentLeaf) || [currentLeaf];
      const pdfR2Key = `${treePath.join('/')}/${args.id}-sources.pdf`;
      const { url: newPdfUrl } = await uploadFileToR2(r2, pdf.pdfPath, pdfR2Key, 'application/pdf', args.dryRun);
      result.newPdfUrl = newPdfUrl;
      if (!args.dryRun) {
        for (const { node, index } of occurrences) node.lectures[index].pdfUrl = newPdfUrl;
        if (fs.existsSync(pdf.pdfPath)) fs.unlinkSync(pdf.pdfPath);
      }
      result.oldPdfDeletion = await deleteOldR2Object(r2, oldPdfUrl, args.dryRun);
    }
  }

  // re-categorization: move to a new set of leaf nodes
  if (args.nodePath && args.nodePath.length) {
    result.changed.push('placement');
    const lecture = { ...template };
    if (audio) { lecture.audioUrl = result.newAudioUrl; lecture.duration = audio.duration; }
    for (const field of ['title', 'description', 'speaker', 'date']) if (args[field] !== undefined) lecture[field] = args[field];
    if (args.tags && args.tags.length) lecture.tags = args.tags;
    if (args.removePdf) delete lecture.pdfUrl;
    else if (result.newPdfUrl) lecture.pdfUrl = result.newPdfUrl;

    result.movedFrom = [...new Set(occurrences.map((o) => o.node.id))];
    result.movedTo = args.nodePath;
    if (!args.dryRun) {
      // remove every current occurrence (highest index first so splices don't shift)
      const byNode = new Map();
      for (const { node, index } of occurrences) {
        if (!byNode.has(node)) byNode.set(node, []);
        byNode.get(node).push(index);
      }
      for (const [node, idxs] of byNode) idxs.sort((a, b) => b - a).forEach((i) => node.lectures.splice(i, 1));

      for (const nodeId of args.nodePath) {
        const node = findNode(data.categories, nodeId);
        if (!node) throw new Error(`placement node not found: ${nodeId}`);
        if (!Array.isArray(node.lectures)) throw new Error(`${nodeId} is not a leaf (no lectures[])`);
        node.lectures.unshift(lecture);
      }
    }
  }

  if (!result.changed.length) throw new Error('nothing to fix — pass at least one of --title/--description/--speaker/--date/--tags/--node-path/--audio-file/--audio-url/--yutorah-id/--yutorah-url/--pdf-file/--pdf-url/--remove-pdf');
  return result;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.mode) throw new Error('--mode add|fix is required');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = LECTURES_PATH.replace('.json', `.backup-${args.mode}-shiur-${stamp}.json`);
  if (!args.dryRun) fs.copyFileSync(LECTURES_PATH, backup);

  const data = JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf8'));
  const r2 = makeR2();

  const result = args.mode === 'add' ? await runAdd(args, data, r2)
    : args.mode === 'fix' ? await runFix(args, data, r2)
    : (() => { throw new Error(`unknown mode: ${args.mode}`); })();

  if (args.dryRun) {
    console.log(JSON.stringify({ ...result, dryRun: true }, null, 2));
    return;
  }

  fs.writeFileSync(LECTURES_PATH, JSON.stringify(data, null, 2));
  execFileSync('node', ['scripts/generate-node-data.mjs'], { stdio: 'inherit' });

  // verify placement in the generated static files
  const placements = result.insertedInto || result.movedTo || [];
  let allIn = placements.length === 0;
  const verify = [];
  for (const nodeId of placements) {
    const nf = JSON.parse(fs.readFileSync(path.join('public', 'lectures-data', `${nodeId}.json`), 'utf8'));
    const inNode = (nf.lectures || []).some((l) => l.id === result.id);
    verify.push({ nodeId, present: inNode });
    if (!inNode) allIn = false;
  }
  const catalog = JSON.parse(fs.readFileSync(path.join('public', 'lectures-data', 'catalog.json'), 'utf8'));
  const catEntry = catalog.find((l) => l.id === result.id);

  console.log(JSON.stringify({ ...result, backup, verify, inCatalog: !!catEntry, breadcrumb: catEntry?.breadcrumb }, null, 2));
}

main().catch((e) => { console.error(JSON.stringify({ status: 'error', stage: e.stage, message: e.message }, null, 2)); process.exit(1); });
