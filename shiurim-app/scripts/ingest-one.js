#!/usr/bin/env node
// =============================================================================
// ingest-one.js — REAL single-shiur end-to-end ingest (Schneeweiss migration).
//   1. backs up data/lectures.json
//   2. uploads the local MP3 to R2 (real upload)
//   3. inserts the lecture object into the target node(s) in data/lectures.json
//   4. regenerates public/lectures-data/ and verifies
// Stops before any git commit / deploy.
//
// Usage: node scripts/ingest-one.js
// =============================================================================
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// ── Config for this run ──────────────────────────────────────────────────────
const SHIUR_ID = '1180731';
const R2_KEY = `Schneeweiss/${SHIUR_ID}.mp3`;
const TAGS = ['chukat'];
const PLACEMENTS = ['bamidbar-chukat']; // single placement for this one
const MP3_PATH = path.join('scripts', 'pilot-output', 'pilot-media', `${SHIUR_ID}.mp3`);
const LECTURES_PATH = path.join('data', 'lectures.json');

const R2_PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const encodeKey = (k) => k.split('/').map(encodeURIComponent).join('/');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

function findNode(categories, id) {
  let hit = null;
  (function walk(ns) { for (const n of ns) { if (n.id === id) hit = n; if (n.children) walk(n.children); } })(categories);
  return hit;
}

(async () => {
  // ── source metadata from the validated pilot output ──
  const pilot = JSON.parse(fs.readFileSync(path.join('scripts', 'pilot-output', 'pilot-output.json'), 'utf8'));
  const rec = pilot.find((p) => p.id === `YBT-${SHIUR_ID}`);
  if (!rec) throw new Error(`pilot-output.json has no YBT-${SHIUR_ID}`);
  if (!fs.existsSync(MP3_PATH)) throw new Error(`missing local MP3: ${MP3_PATH}`);

  // ── 1. backup ──
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = LECTURES_PATH.replace('.json', `.backup-ingest-${stamp}.json`);
  fs.copyFileSync(LECTURES_PATH, backup);
  console.log(`[1/5] backed up lectures.json → ${backup}`);

  // ── 2. real R2 upload ──
  const body = fs.readFileSync(MP3_PATH);
  console.log(`[2/5] uploading ${(body.length / 1e6).toFixed(2)} MB → r2://${process.env.R2_BUCKET_NAME}/${R2_KEY} ...`);
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME, Key: R2_KEY, Body: body, ContentType: 'audio/mpeg',
  }));
  const audioUrl = `${R2_PUBLIC_URL}/${encodeKey(R2_KEY)}`;
  console.log(`      audioUrl = ${audioUrl}`);

  // ── verify the object is publicly reachable ──
  const head = await fetch(audioUrl, { method: 'HEAD', redirect: 'follow' });
  console.log(`      HEAD ${audioUrl} → ${head.status} (${head.headers.get('content-type')}, ${head.headers.get('content-length')} bytes)`);
  if (!head.ok) throw new Error(`uploaded object not reachable (HTTP ${head.status})`);

  // ── 3. build lecture object + insert into placement node(s) ──
  const lecture = {
    id: `YBT-${SHIUR_ID}`,
    title: rec.title,
    audioUrl,
    duration: rec.duration,            // seconds (ffprobe)
    description: rec.description,
    speaker: rec.speaker,              // "Rabbi Matt Schneeweiss"
    date: rec.date,                    // "2026-06-25"
    tags: TAGS,
  };
  const data = JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf8'));
  for (const nodeId of PLACEMENTS) {
    const node = findNode(data.categories, nodeId);
    if (!node) throw new Error(`placement node not found: ${nodeId}`);
    if (!Array.isArray(node.lectures)) throw new Error(`${nodeId} is not a leaf (no lectures[])`);
    if (node.lectures.some((l) => l.id === lecture.id)) { console.log(`[3/5] ${nodeId}: already present, skipping insert`); continue; }
    node.lectures.unshift(lecture); // newest-first, matching the pending-merge convention
    console.log(`[3/5] inserted into ${nodeId} (now ${node.lectures.length} lectures)`);
  }
  fs.writeFileSync(LECTURES_PATH, JSON.stringify(data, null, 2));
  console.log(`      wrote ${LECTURES_PATH}`);

  // ── 4. regenerate static data ──
  console.log('[4/5] running generate-node-data ...');
  execFileSync('node', ['scripts/generate-node-data.mjs'], { stdio: 'inherit' });

  // ── 5. verify it landed in the generated files ──
  const nodeFile = JSON.parse(fs.readFileSync(path.join('public', 'lectures-data', `${PLACEMENTS[0]}.json`), 'utf8'));
  const inNode = (nodeFile.lectures || []).some((l) => l.id === lecture.id);
  const catalog = JSON.parse(fs.readFileSync(path.join('public', 'lectures-data', 'catalog.json'), 'utf8'));
  const catEntry = catalog.find((l) => l.id === lecture.id);
  console.log(`[5/5] in ${PLACEMENTS[0]}.json: ${inNode ? 'YES' : 'NO'} | in catalog.json: ${catEntry ? 'YES' : 'NO'}${catEntry ? ` (breadcrumb: ${catEntry.breadcrumb.join(' › ')})` : ''}`);

  console.log('\n✅ DONE (no commit/deploy). Review locally with `npm run dev`, then commit data/lectures.json when satisfied.');
  console.log(`   Backup: ${backup}`);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
