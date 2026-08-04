#!/usr/bin/env node
// =============================================================================
// yutorah-date-range-import.js
//
// One-off (but reusable) tool for importing a date-window's worth of YUTorah
// org shiurim across MULTIPLE teachers — as opposed to yutorah-scraper.js
// (whole-org bulk, no date filter, no dedup beyond exact id, no R2 upload) or
// add-or-fix-shiur.js (single shiur at a time, caller supplies node-path).
//
// This script does NOT categorize with an API and does NOT decide dedup on
// its own. It only:
//   --report   fetches docs in [--after, --before], flags exact-id dupes,
//              surfaces same-speaker/nearby-date candidates for a human to
//              eyeball, and suggests a target node via yutorah-scraper.js's
//              CATEGORY_MAP (same resolveTargetId logic). Writes JSON, no
//              mutation.
//   --apply    reads a decisions file (produced by hand after reviewing the
//              report) and, for each `action: "add"` entry, shells out to
//              the already-tested add-or-fix-shiur.js (which does the real
//              download/transcode/R2-upload/tree-mutation/regen/verify).
//
// Usage:
//   node scripts/yutorah-date-range-import.js --report \
//     --org 367 --after 2026-04-28 --before 2026-08-04 \
//     --out ../scratchpad/yutorah-report.json
//
//   node scripts/yutorah-date-range-import.js --apply \
//     --decisions ../scratchpad/yutorah-decisions.json [--dry-run]
// =============================================================================
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { CATEGORY_MAP, NEW_NODES } = require('./yutorah-scraper.js');

const API_BASE = 'https://classic.yutorah.org/search/_get_search_results.cfm';
const PAGE_SIZE = 30;
const LECTURES_PATH = path.join('data', 'lectures.json');

// ── shared small helpers (mirrors of the equivalents in yutorah-scraper.js /
//    lib/rabbi-normalization.ts, copied inline since this is a plain CJS
//    script and those live behind @/ path aliases / TS) ────────────────────
function str(val) {
  if (Array.isArray(val)) return (val[0] || '').trim();
  if (typeof val === 'string') return val.trim();
  return '';
}

const GENERIC = new Set([
  'discussion-general', 'halacha-general', 'other-gemarah',
  'misc-general', 'kisvei-chazal-all',
]);

function resolveTargetId(doc) {
  const cats = [].concat(doc.categoryname || []).map((s) => s.trim()).filter(Boolean);
  const subcats = [].concat(doc.subcategoryname || []).map((s) => s.trim()).filter(Boolean);
  const teacher = str(doc.teacherfullname);

  for (const cat of cats) {
    for (const subcat of subcats) {
      if (cat === 'Mishna' && subcat === 'Avot') {
        return teacher === 'Rabbi Pesach Chait'
          ? 'kisvei-rishonim-rambam-shemonah-perakim'
          : 'kisvei-chazal-all';
      }
    }
  }

  let firstMatch = null;
  let specificMatch = null;
  for (const cat of cats) {
    for (const subcat of subcats) {
      const mapped = CATEGORY_MAP[`${cat}|${subcat}`];
      if (mapped) {
        if (!firstMatch) firstMatch = mapped;
        if (!specificMatch && !GENERIC.has(mapped)) specificMatch = mapped;
      }
    }
    const catKey = `${cat}|`;
    if (CATEGORY_MAP[catKey] && !firstMatch) firstMatch = CATEGORY_MAP[catKey];
  }
  return specificMatch || firstMatch || null;
}

// Rabbi-normalization: canonical name -> known raw variants (copied from
// lib/rabbi-normalization.ts; keep in sync if that map changes).
const RABBI_GROUPS = {
  'Rabbi Chait': ['Rabbi Yisroel Chait', 'Rabbi Chait'],
  'Rabbi Mann': ['Rabbi Reuven Mann', 'Rabbi Mann'],
  'Rabbi Bald': ['Rabbi Henoch Bald', 'Rabbi H. Bald', 'R. H. Bald', 'Rabbi Bald'],
  'Rabbi Cinamon': ['Rabbi Zev Cinamon', 'Rabbi Z. Cinamon'],
  'Rabbi Moskowitz': ['Rabbi M. Moskowitz', 'Rabbi Morton Moskowitz', 'Rabbi Moskowitz'],
  'Rabbi David Markowitz': ['Rabbi David Markowitz', 'Rabbi D. Markowitz'],
  'Rabbi Schneeweiss': ['Rabbi Matthew Schneeweiss', 'Rabbi Mathew Schneeweiss', 'Rabbi Schneeweiss'],
};
const RAW_TO_CANONICAL = {};
for (const [canonical, variants] of Object.entries(RABBI_GROUPS)) {
  for (const v of variants) RAW_TO_CANONICAL[v] = canonical;
}
function normalizeRabbi(raw) {
  return RAW_TO_CANONICAL[raw] || raw;
}
// Loose last-name key for cross-speaker-scheme comparison (e.g. "Rabbi Matt
// Schneeweiss" vs "Rabbi M. Schneeweiss" vs "R. Schneeweiss").
function speakerKey(raw) {
  const canon = normalizeRabbi((raw || '').trim());
  const words = canon.replace(/^(Rabbi|Rav|R\.)\s+/i, '').trim().split(/\s+/);
  return (words[words.length - 1] || '').toLowerCase();
}

function normalizeTitle(t) {
  return (t || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
}
function titleSimilarity(a, b) {
  const wa = new Set(normalizeTitle(a));
  const wb = new Set(normalizeTitle(b));
  if (!wa.size || !wb.size) return 0;
  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  return overlap / Math.max(wa.size, wb.size);
}
function daysBetween(d1, d2) {
  const t1 = Date.parse(d1);
  const t2 = Date.parse(d2);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Infinity;
  return Math.abs(t1 - t2) / 86400000;
}

// ── tree helpers ─────────────────────────────────────────────────────────────
function walkLectures(categories, cb) {
  (function walk(nodes, trail) {
    for (const n of nodes) {
      const nextTrail = [...trail, { id: n.id, label: n.label }];
      if (Array.isArray(n.lectures)) {
        for (const l of n.lectures) cb(l, nextTrail);
      }
      if (n.children) walk(n.children, nextTrail);
    }
  })(categories, []);
}

function buildExistingIndex(categories) {
  const ids = new Set();
  const all = [];
  walkLectures(categories, (l, trail) => {
    ids.add(l.id);
    all.push({ id: l.id, title: l.title, speaker: l.speaker, date: l.date, breadcrumb: trail });
  });
  return { ids, all };
}

// ── YUTorah API ────────────────────────────────────────────────────────────
async function fetchPage(orgId, page) {
  const url = `${API_BASE}?organizationID=${orgId}&sort_by=${encodeURIComponent('shiurdate desc')}&search_query=&page=${page}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return res.json();
}

async function fetchDocsInRange(orgId, afterDate, beforeDate) {
  const after = new Date(`${afterDate}T00:00:00Z`).getTime();
  const before = new Date(`${beforeDate}T23:59:59Z`).getTime();
  const docs = [];
  let page = 1;
  let totalPages = Infinity;
  while (page <= totalPages) {
    const json = await fetchPage(orgId, page);
    const pageDocs = json.response?.docs || [];
    const numFound = json.response?.numFound ?? 0;
    totalPages = Math.max(1, Math.ceil(numFound / PAGE_SIZE));
    if (!pageDocs.length) break;

    let sawOlderThanWindow = false;
    for (const doc of pageDocs) {
      const t = Date.parse(doc.shiurdate);
      if (Number.isNaN(t)) continue;
      if (t > before) continue; // newer than window (shouldn't happen, sorted desc) — skip
      if (t < after) { sawOlderThanWindow = true; continue; }
      docs.push(doc);
    }
    // Results are sorted shiurdate desc, so once a whole page is older than
    // the window we can stop paging.
    if (sawOlderThanWindow && pageDocs.every((d) => Date.parse(d.shiurdate) < after)) break;
    page++;
    await new Promise((r) => setTimeout(r, 300));
  }
  return docs;
}

// ── report mode ──────────────────────────────────────────────────────────
async function runReport(args) {
  const data = JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf8'));
  const { ids: existingIds, all: existingLectures } = buildExistingIndex(data.categories);

  console.log(`Fetching org ${args.org} shiurim from ${args.after} to ${args.before}...`);
  const docs = await fetchDocsInRange(args.org, args.after, args.before);
  console.log(`Found ${docs.length} shiurim in range.`);

  const report = docs.map((doc) => {
    const id = `YBT-${doc.shiurid}`;
    const exactDuplicate = existingIds.has(id);

    const candidates = [];
    if (!exactDuplicate) {
      const skey = speakerKey(doc.teacherfullname);
      for (const ex of existingLectures) {
        const dDays = daysBetween(ex.date, (doc.shiurdate || '').slice(0, 10));
        if (dDays > 5) continue;
        const sameSpeaker = skey && speakerKey(ex.speaker) === skey;
        const simTitle = titleSimilarity(ex.title, doc.shiurtitle);
        if (!sameSpeaker && simTitle < 0.25) continue;
        candidates.push({
          id: ex.id,
          title: ex.title,
          speaker: ex.speaker,
          date: ex.date,
          daysApart: +dDays.toFixed(1),
          sameSpeaker,
          titleSimilarity: +simTitle.toFixed(2),
          location: ex.breadcrumb.map((b) => b.label).join(' > '),
        });
      }
      candidates.sort((a, b) => (b.sameSpeaker - a.sameSpeaker) || (b.titleSimilarity - a.titleSimilarity) || (a.daysApart - b.daysApart));
    }

    return {
      shiurid: doc.shiurid,
      id,
      title: doc.shiurtitle || '',
      speaker: str(doc.teacherfullname),
      speakerNormalized: normalizeRabbi(str(doc.teacherfullname)),
      date: (doc.shiurdate || '').slice(0, 10),
      category: [].concat(doc.categoryname || []),
      subcategory: [].concat(doc.subcategoryname || []),
      description: doc.shiurdescription || '',
      mediaType: doc.mediatypename || '',
      fileMissing: !!doc.shiurIsFileMissingOnServer,
      suggestedNodeId: resolveTargetId(doc),
      exactDuplicate,
      dedupCandidates: candidates.slice(0, 5),
    };
  });

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(report, null, 2));
  console.log(`Report written to ${args.out}`);
  console.log(`  exact duplicates: ${report.filter((r) => r.exactDuplicate).length}`);
  console.log(`  with dedup candidates: ${report.filter((r) => !r.exactDuplicate && r.dedupCandidates.length).length}`);
  console.log(`  no category suggestion: ${report.filter((r) => !r.suggestedNodeId).length}`);
}

// Same node shape/logic as yutorah-scraper.js's findNode/ensureNode, used here
// to create any target leaf that doesn't exist yet (e.g. CATEGORY_MAP maps to
// a NEW_NODES-defined node that a prior full yutorah-scraper.js run never
// created). Only handles simple 'lectures'-type leaves under an existing
// parent — good enough for the handful of gaps a date-window import hits.
function findNodeInTree(categories, id) {
  for (const node of categories) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNodeInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function ensureNodesExist(nodeIds) {
  const data = JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf8'));
  let changed = false;
  for (const nodeId of nodeIds) {
    if (findNodeInTree(data.categories, nodeId)) continue;
    const nodeDef = NEW_NODES.find((n) => n.id === nodeId);
    if (!nodeDef) throw new Error(`node ${nodeId} does not exist and has no NEW_NODES definition to create it from`);
    const parent = findNodeInTree(data.categories, nodeDef.parentId);
    if (!parent) throw new Error(`cannot create ${nodeId}: parent ${nodeDef.parentId} not found`);
    const newNode = nodeDef.type === 'folder'
      ? { id: nodeDef.id, label: nodeDef.label, children: [] }
      : { id: nodeDef.id, label: nodeDef.label, lectures: [] };
    if (Array.isArray(parent.children)) parent.children.push(newNode);
    else parent.children = [newNode];
    console.log(`[created node] ${nodeId} -> parent ${nodeDef.parentId}`);
    changed = true;
  }
  if (changed) fs.writeFileSync(LECTURES_PATH, JSON.stringify(data, null, 2));
}

// ── apply mode ───────────────────────────────────────────────────────────
async function runApply(args) {
  const decisions = JSON.parse(fs.readFileSync(args.decisions, 'utf8'));

  const neededNodeIds = [...new Set(decisions.filter((d) => d.action === 'add').flatMap((d) => d.nodePath || []))];
  ensureNodesExist(neededNodeIds);

  const results = [];
  for (const d of decisions) {
    if (d.action !== 'add') {
      results.push({ shiurid: d.shiurid, status: 'skipped', note: d.note || '' });
      continue;
    }
    if (!d.nodePath || !d.nodePath.length) {
      results.push({ shiurid: d.shiurid, status: 'error', message: 'missing nodePath' });
      continue;
    }
    const cliArgs = [
      'scripts/add-or-fix-shiur.js',
      '--mode', 'add',
      '--yutorah-id', String(d.shiurid),
      '--yutorah-org', String(args.org),
      '--node-path', d.nodePath.join(','),
    ];
    if (d.tags && d.tags.length) cliArgs.push('--tags', d.tags.join(','));
    if (args.dryRun) cliArgs.push('--dry-run');
    console.log(`\n=== shiur ${d.shiurid} -> ${d.nodePath.join(',')} ===`);
    try {
      execFileSync('node', cliArgs, { stdio: 'inherit' });
      results.push({ shiurid: d.shiurid, status: 'ok', nodePath: d.nodePath });
    } catch (e) {
      results.push({ shiurid: d.shiurid, status: 'error', message: e.message });
    }
  }
  console.log('\n=== apply summary ===');
  console.log(JSON.stringify(results, null, 2));
}

// ── CLI ──────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = { org: 367 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => argv[++i];
    if (a === '--report') out.mode = 'report';
    else if (a === '--apply') out.mode = 'apply';
    else if (a === '--org') out.org = val();
    else if (a === '--after') out.after = val();
    else if (a === '--before') out.before = val();
    else if (a === '--out') out.out = val();
    else if (a === '--decisions') out.decisions = val();
    else if (a === '--dry-run') out.dryRun = true;
    else throw new Error(`unknown arg: ${a}`);
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === 'report') {
    if (!args.after || !args.before || !args.out) throw new Error('--report requires --after, --before, --out');
    await runReport(args);
  } else if (args.mode === 'apply') {
    if (!args.decisions) throw new Error('--apply requires --decisions');
    await runApply(args);
  } else {
    throw new Error('pass --report or --apply');
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
