#!/usr/bin/env node
// =============================================================================
// migrate-schneeweiss.js — full ~804-shiur migration of Rabbi Matt Schneeweiss
// from YUTorah to YBT, self-hosting audio on YBT's R2 bucket.
//
// Wraps the Part-A worker (ingest-shiur.js -> ingestShiur) with:
//   1. enumeration of every teacher-83858 shiur via the search API
//   2. a deterministic categorizer (locked pilot rules) that emits placements[]
//      and FLAGS anything ambiguous for human review instead of guessing
//   3. per-shiur ingest (download -> convert -> validate -> upload -> insert)
//   4. resumability  (checkpoint + dedup-by-id + atomic batch writes)
//   5. rerun-able error handling (per-shiur try/catch -> migrate-failures.json)
//
// Modes:
//   node scripts/migrate-schneeweiss.js --dry-run        enumerate + categorize +
//                                                        report. NO media, NO writes.
//   node scripts/migrate-schneeweiss.js                  full run (ingest all
//                                                        non-flagged shiurim)
//   node scripts/migrate-schneeweiss.js --limit N        full run, first N only
//   node scripts/migrate-schneeweiss.js --retry-failures reprocess failed ids
//
// Categorization, checkpoint, failures, and the flagged-for-review list are all
// written under scripts/ (see PATHS below). data/lectures.json is backed up once
// at the start of a real run and written atomically every BATCH shiurim.
// =============================================================================
require('dotenv').config({ path: '.env.local' });
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { ingestShiur, findNode, makeR2 } = require('./ingest-shiur');
const { CATEGORY_MAP } = require('./yutorah-scraper');

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const TEACHER_ID = '83858';
const PAGE_SIZE = 30;
const API_BASE = 'https://classic.yutorah.org/search/_get_search_results.cfm';
const PAGE_DELAY_MS = 400;
const LECTURES_PATH = path.join('data', 'lectures.json');
const HIER_PATH = path.join('data', 'folder-hierarchy.json');
const OUT_DIR = path.join('scripts', 'pilot-output');
const CHECKPOINT_PATH = path.join(OUT_DIR, 'migrate-checkpoint.json');
const FLAGGED_PATH = path.join(OUT_DIR, 'migrate-flagged.json');
const FAILURES_PATH = path.join('scripts', 'migrate-failures.json');
fs.mkdirSync(OUT_DIR, { recursive: true }); // fresh checkouts (CI) won't have this dir yet

// ─── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const RETRY = argv.includes('--retry-failures');
const limIdx = argv.indexOf('--limit');
const LIMIT = limIdx !== -1 ? parseInt(argv[limIdx + 1], 10) : Infinity;

// ─── HIERARCHY RESOLVER (from pilot-scrape.js) ───────────────────────────────
const hier = JSON.parse(fs.readFileSync(HIER_PATH, 'utf8'));
const byId = new Map();
const parentChain = new Map();
(function walk(nodes, chain) {
  for (const n of nodes) {
    const c = [...chain, n.id];
    byId.set(n.id, n);
    parentChain.set(n.id, c);
    if (n.children) walk(n.children, c);
  }
})(hier.categories, []);

const norm = (s) => String(s || '').toLowerCase()
  .replace(/['’`"]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const exists = (id) => id && byId.has(id);
const topNs = (id) => (parentChain.get(id) || [])[0] || null;

// Find a descendant of rootId whose label matches (normalized). When several
// match (e.g. the book folder "Vayikra" AND the parsha leaf "Vayikra"), PREFER
// the leaf — that's the real insert target.
function findDescendantByLabel(rootId, targetLabel) {
  const target = norm(targetLabel);
  let firstMatch = null;
  for (const [id] of byId) {
    const chain = parentChain.get(id);
    if (!chain.includes(rootId) || id === rootId) continue;
    const node = byId.get(id);
    if (norm(node.label) !== target) continue;
    if (!node.children) return id; // leaf wins
    if (!firstMatch) firstMatch = id;
  }
  return firstMatch;
}

// ─── ALIAS / KEYWORD MAPS (from pilot-scrape.js) ─────────────────────────────
const NACH_ALIAS = { 'tehilim': 'tehillim', 'koheles': 'kohelet' };
// normalized YUTorah parsha value -> normalized hierarchy LEAF label.
// Every target verified against a real leaf in folder-hierarchy.json.
const PARSHA_ALIAS = {
  'chukas': 'chukat', 'beshalised': 'beshalach',
  'acharei mot': 'acharei', 'behaalotecha': 'behaalotcha',
  'chayei sara': 'chayei sarah', 'mikeitz': 'miketz', 'naso': 'nasso',
  'teruma': 'terumah', 'vaera': 'vaeira', 'vayeilech': 'vayelech',
  'vayeishev': 'vayeshev',
};
const HOLIDAY_NODE = {
  'yom kippur': 'holidays-rosh-hashana-yom-kippur',
  'rosh hashana': 'holidays-rosh-hashana-yom-kippur',
  'rosh hashanah': 'holidays-rosh-hashana-yom-kippur',
  'yamim noraim': 'holidays-rosh-hashana-yom-kippur',
  'chanukah': 'holidays-chanukah', 'purim': 'holidays-purim-purim',
  'pesach': 'holidays-pesach', 'shavuos': 'holidays-shavuos', 'shavuot': 'holidays-shavuos',
  'sukkos': 'holidays-sukkos', 'sukkot': 'holidays-sukkos',
  'tisha bav': 'holidays-tisha-bav', 'elul': 'holidays-elul',
};
const HOLIDAY_VALUES = new Set(Object.keys(HOLIDAY_NODE));
const DISCUSSION_NODE = {
  'olam habah': 'discussion-olam-haba', 'olam haba': 'discussion-olam-haba',
  'emunah': 'discussion-emunah', 'mussar': 'discussion-mussar',
  'middot': 'discussion-middot', 'teshuva': 'discussion-teshuva',
};
const RISHONIM_RE = /\b(moreh nevuchim|moreh|rambam|ramban|abarbanel|rashba|kuzari|rishonim)\b/;
function resolveRishonim(text) {
  const t = norm(text);
  if (/\bmoreh\b/.test(t)) return 'kisvei-rishonim-rambam-moreh-nevuchim';
  if (/\brambam\b/.test(t)) return 'kisvei-rishonim-rambam-general';
  if (/\bramban\b/.test(t)) return 'kisvei-rishonim-ramban';
  if (/\babarbanel\b/.test(t)) return 'kisvei-rishonim-abarbanel';
  if (/\brashba\b/.test(t)) return 'kisvei-rishonim-rashba';
  if (/\bkuzari\b/.test(t)) return 'kisvei-rishonim-kuzari';
  return 'kisvei-rishonim'; // generic top — non-leaf, will be flagged
}
const CONF_RANK = { high: 3, medium: 2, demote: 1 };

// ─── PER-SHIUR OVERRIDES ─────────────────────────────────────────────────────
// Manually resolved placements for the 32 shiurim the categorizer flagged.
// Keyed by shiurID string. When present, bypasses categorize() entirely.
const SHIUR_OVERRIDES = {
  // multi-namespace (nach, discussion) — Mishlei primary
  '1174373': { placements: ['nach-mishlei', 'discussion-relationships'],  primary: 'nach-mishlei',  confidence: 'high' },
  '1167430': { placements: ['nach-mishlei', 'discussion-bitachon'],       primary: 'nach-mishlei',  confidence: 'high' },
  '1142407': { placements: ['nach-mishlei', 'discussion-mussar'],         primary: 'nach-mishlei',  confidence: 'high' },
  '1142406': { placements: ['nach-mishlei', 'discussion-mussar'],         primary: 'nach-mishlei',  confidence: 'high' },
  '1142169': { placements: ['nach-mishlei', 'discussion-middot'],         primary: 'nach-mishlei',  confidence: 'high' },
  '1143830': { placements: ['nach-mishlei', 'discussion-bitachon'],       primary: 'nach-mishlei',  confidence: 'high' },
  '1142176': { placements: ['nach-mishlei', 'discussion-mussar'],         primary: 'nach-mishlei',  confidence: 'high' },
  '1141882': { placements: ['nach-mishlei', 'discussion-relationships'],  primary: 'nach-mishlei',  confidence: 'high' },
  '1141424': { placements: ['nach-mishlei', 'discussion-bitachon'],       primary: 'nach-mishlei',  confidence: 'high' },
  '1141437': { placements: ['nach-mishlei', 'discussion-bitachon'],       primary: 'nach-mishlei',  confidence: 'high' },
  '1141562': { placements: ['nach-mishlei', 'discussion-hashem', 'discussion-reward-punishment'], primary: 'nach-mishlei', confidence: 'high' },
  // multi-namespace (nach, discussion) — Iyov primary
  '1152328': { placements: ['nach-iyov', 'discussion-ikkarei-emunah'],    primary: 'nach-iyov',     confidence: 'high' },
  // no-match — Mishna Avot (Pirkei Avot learning series)
  '1154271': { placements: ['kisvei-chazal-all'], primary: 'kisvei-chazal-all', confidence: 'high' },
  '1153272': { placements: ['kisvei-chazal-all'], primary: 'kisvei-chazal-all', confidence: 'high' },
  '1152279': { placements: ['kisvei-chazal-all'], primary: 'kisvei-chazal-all', confidence: 'high' },
  '1148709': { placements: ['kisvei-chazal-all'], primary: 'kisvei-chazal-all', confidence: 'high' },
  '1147737': { placements: ['kisvei-chazal-all'], primary: 'kisvei-chazal-all', confidence: 'high' },
  '1146772': { placements: ['kisvei-chazal-all'], primary: 'kisvei-chazal-all', confidence: 'high' },
  // no-match — parasha with no tags
  '1169957': { placements: ['shemot-vayakhel'],   primary: 'shemot-vayakhel',  confidence: 'high'   },
  // no-match — Yisro parasha (only tag is Machshava:Torah, which is suppressed)
  '1164543': { placements: ['shemot-yitro'],      primary: 'shemot-yitro',     confidence: 'high'   },
  // no-match — Yerushalmi Taanis / "Gam Zu l'Tovah"
  '1163879': { placements: ['discussion-emunah'], primary: 'discussion-emunah', confidence: 'medium' },
  // multi-namespace (nach, gemarah)
  '1167514': { placements: ['gemarah-megillah', 'nach-megillot-esther'], primary: 'gemarah-megillah', confidence: 'high' },
  '1167282': { placements: ['nach-mishlei', 'gemarah-megillah'],         primary: 'nach-mishlei',    confidence: 'high' },
  '1167055': { placements: ['nach-mishlei', 'gemarah-megillah'],         primary: 'nach-mishlei',    confidence: 'high' },
  // incidental-holiday-only
  '1150217': { placements: ['holidays-sukkos'],                    primary: 'holidays-sukkos',                   confidence: 'medium' },
  '1149765': { placements: ['holidays-rosh-hashana-yom-kippur'],   primary: 'holidays-rosh-hashana-yom-kippur',  confidence: 'medium' },
  '1149782': { placements: ['holidays-rosh-hashana-yom-kippur'],   primary: 'holidays-rosh-hashana-yom-kippur',  confidence: 'medium' },
  // multi-namespace (nach, halacha) — Mishlei primary
  '1143816': { placements: ['nach-mishlei'], primary: 'nach-mishlei', confidence: 'high' },
  '1141561': { placements: ['nach-mishlei'], primary: 'nach-mishlei', confidence: 'high' },
  // multi-namespace (chumash, holidays) — parasha primary
  '1168151': { placements: ['shemot-ki-tisa'],   primary: 'shemot-ki-tisa',   confidence: 'high' },
  // multi-namespace (chumash, halacha) — parasha primary
  '1165603': { placements: ['shemot-mishpatim'], primary: 'shemot-mishpatim', confidence: 'high' },
  // multi-namespace (gemarah, kisvei-chazal) — gemara primary
  '1180268': { placements: ['gemarah-chagiga'],  primary: 'gemarah-chagiga',  confidence: 'high' },
};

// ─── CATEGORIZER ─────────────────────────────────────────────────────────────
// Returns { placements:[ids], primary, confidence, flag:null|reason, candidates }.
// `isLeaf(id)` checks leaf-ness against the real insert target (lectures.json).
// Conservative: only single-namespace high/medium matches (plus the two locked
// override patterns) are ingestable; everything else is flagged for review.
function categorize({ pairs, title }, isLeaf) {
  const cands = []; // { nodeId, conf, ns, rule, source }
  const push = (c) => { if (c.nodeId) cands.push(c); };
  let rishonimHit = null;

  for (const { ns, val } of pairs) {
    const nsn = norm(ns), valn = norm(val);
    if (nsn === 'machshava' && valn === 'torah') continue; // locked: ignore per pilot

    if (nsn === 'nach') {
      const lbl = NACH_ALIAS[valn] || valn;
      push({ nodeId: findDescendantByLabel('nach', lbl), conf: 'high', ns: 'nach', rule: 'Nach tag', source: `Nach: ${val}` });
    } else if (nsn === 'parsha') {
      const lbl = PARSHA_ALIAS[valn] || valn;
      push({ nodeId: findDescendantByLabel('chumash', lbl), conf: 'high', ns: 'chumash', rule: 'Parsha tag', source: `Parsha: ${val}` });
    } else if ((nsn === 'halacha' || nsn === 'machshava') && HOLIDAY_VALUES.has(valn)) {
      // locked: incidental holiday-named tag -> demoted cross-list only
      push({ nodeId: HOLIDAY_NODE[valn], conf: 'demote', ns: 'holiday', rule: 'Holiday tag (incidental, demoted)', source: `${ns}: ${val}` });
    } else if (nsn === 'machshava' || nsn === 'halacha') {
      if (RISHONIM_RE.test(valn)) {
        const id = resolveRishonim(valn);
        push({ nodeId: id, conf: 'medium', ns: 'rishonim', rule: 'Rishonim keyword (tag)', source: `${ns}: ${val}` });
        rishonimHit = rishonimHit || id;
      } else {
        const id = DISCUSSION_NODE[valn] || findDescendantByLabel('discussion', valn) || CATEGORY_MAP[`${ns}|${val}`];
        push({ nodeId: id, conf: 'medium', ns: 'discussion', rule: 'Topical -> Discussion', source: `${ns}: ${val}` });
      }
    } else if (nsn === 'mishna' || nsn === 'gemara') {
      push({ nodeId: CATEGORY_MAP[`${ns}|${val}`] || 'kisvei-chazal-all', conf: 'medium', ns: 'chazal', rule: 'Mishna/Gemara', source: `${ns}: ${val}` });
    } else {
      const mapped = CATEGORY_MAP[`${ns}|${val}`];
      if (mapped) push({ nodeId: mapped, conf: 'medium', ns: nsn || 'map', rule: 'CATEGORY_MAP', source: `${ns}: ${val}` });
    }
  }

  // title-based Rishonim (locked: outranks Nach)
  if (RISHONIM_RE.test(norm(title))) {
    const id = resolveRishonim(title);
    push({ nodeId: id, conf: 'medium', ns: 'rishonim', rule: 'Rishonim keyword (title)', source: 'title' });
    rishonimHit = rishonimHit || id;
  }
  const qa = /q\s*&\s*a/i.test(title) || /\bq and a\b/i.test(title);

  // valid (exists + leaf) candidates, deduped by nodeId keeping best conf
  const bestById = new Map();
  for (const c of cands) {
    if (!exists(c.nodeId) || !isLeaf(c.nodeId)) continue;
    const prev = bestById.get(c.nodeId);
    if (!prev || CONF_RANK[c.conf] > CONF_RANK[prev.conf]) bestById.set(c.nodeId, c);
  }
  const leafValid = [...bestById.values()].sort((a, b) => CONF_RANK[b.conf] - CONF_RANK[a.conf]);
  const hadNonLeaf = cands.some((c) => exists(c.nodeId) && !isLeaf(c.nodeId));
  const result = (flag, primary, placements, confidence) =>
    ({ flag, primary: primary || null, placements: placements || [], confidence: confidence || null, candidates: cands });

  // ── LOCKED OVERRIDE 1: "Q&A" in title -> Discussion/Q&A primary, cross-list rest
  if (qa) {
    if (!(exists('discussion-qa') && isLeaf('discussion-qa'))) return result('override-target-missing: discussion-qa', null, [], null);
    const others = leafValid.map((c) => c.nodeId).filter((id) => id !== 'discussion-qa');
    return result(null, 'discussion-qa', ['discussion-qa', ...others], 'high');
  }

  // ── LOCKED OVERRIDE 2: Rishonim keyword -> outranks Nach as primary
  if (rishonimHit) {
    if (!(exists(rishonimHit) && isLeaf(rishonimHit))) return result(`rishonim-nonleaf: ${rishonimHit}`, null, [], null);
    const others = leafValid.map((c) => c.nodeId).filter((id) => id !== rishonimHit);
    return result(null, rishonimHit, [rishonimHit, ...others], 'high');
  }

  // ── DEFAULT: conservative single-namespace resolution ──
  if (leafValid.length === 0) {
    return result(hadNonLeaf ? 'non-leaf-only (resolves only to a folder)' : 'no-match', null, [], null);
  }
  const strong = leafValid.filter((c) => c.conf !== 'demote');
  const demoted = leafValid.filter((c) => c.conf === 'demote');
  if (strong.length === 0) {
    return result('incidental-holiday-only (no primary subject tag)', null, [], null);
  }
  const namespaces = new Set(strong.map((c) => topNs(c.nodeId)));
  if (namespaces.size > 1) {
    return result(`multi-namespace (${[...namespaces].join(', ')})`, null, [], null);
  }
  const primary = strong[0];
  const placements = [...strong, ...demoted].map((c) => c.nodeId);
  return result(null, primary.nodeId, placements, primary.conf);
}

// ─── ENUMERATION ─────────────────────────────────────────────────────────────
const arr = (v) => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchTeacherPage(page) {
  const facet = encodeURIComponent(`teacherid:${TEACHER_ID}`);
  const sort = encodeURIComponent('shiurdate desc');
  const url = `${API_BASE}?search_query=&page=${page}&sort_by=${sort}&facet_query=${facet}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} on page ${page}`);
  return res.json();
}

async function enumerateAll() {
  const docs = [];
  let page = 1, numFound = 0, totalPages = 1;
  while (page <= totalPages) {
    let json;
    try { json = await fetchTeacherPage(page); }
    catch (e) {
      console.error(`  page ${page} error: ${e.message} — retrying in 3s`);
      await sleep(3000);
      try { json = await fetchTeacherPage(page); }
      catch (e2) { console.error(`  page ${page} retry failed — skipping`); page++; continue; }
    }
    numFound = json.response?.numFound || 0;
    totalPages = Math.ceil(numFound / PAGE_SIZE) || 1;
    const pageDocs = json.response?.docs || [];
    if (page === 1) console.log(`\n  numFound = ${numFound} (~${totalPages} pages)\n`);
    if (pageDocs.length === 0) break;
    for (const d of pageDocs) docs.push(d);
    process.stdout.write(`\r  fetched page ${page}/${totalPages} (${docs.length} docs)   `);
    page++;
    if (page <= totalPages) await sleep(PAGE_DELAY_MS);
  }
  console.log('');
  return { docs, numFound };
}

// build the categorizer input from a raw API doc (index-aligned pairs)
function docToPairs(d) {
  const cats = arr(d.categoryname);
  const subs = arr(d.subcategoryname);
  const n = Math.max(cats.length, subs.length);
  const pairs = [], tags = [];
  for (let i = 0; i < n; i++) {
    const ns = cats[i] || cats[0] || '';
    const val = subs[i] || '';
    if (val) { pairs.push({ ns, val }); tags.push(`${ns}: ${val}`); }
  }
  return { pairs, tags };
}

// ─── CHECKPOINT / FAILURE IO ─────────────────────────────────────────────────
const readJson = (p, dflt) => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : dflt;
const writeJson = (p, v) => fs.writeFileSync(p, JSON.stringify(v, null, 2));
function writeLecturesAtomic(data) {
  const tmp = LECTURES_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, LECTURES_PATH);
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n=== migrate-schneeweiss ${DRY_RUN ? '(DRY RUN)' : RETRY ? '(RETRY FAILURES)' : '(FULL RUN)'} ===`);

  // load lectures.json (read-only in dry-run) and define the real leaf test
  const data = JSON.parse(fs.readFileSync(LECTURES_PATH, 'utf8'));
  const leafCache = new Map();
  const isLeaf = (id) => {
    if (leafCache.has(id)) return leafCache.get(id);
    const node = findNode(data.categories, id);
    const v = !!(node && Array.isArray(node.lectures));
    leafCache.set(id, v);
    return v;
  };

  console.log('\nEnumerating teacher 83858 ...');
  const { docs, numFound } = await enumerateAll();
  console.log(`  collected ${docs.length} docs (numFound=${numFound})`);
  if (docs.length === 0) { console.error('No docs — aborting.'); process.exit(1); }

  // categorize every doc (per-shiur overrides take precedence over auto-categorizer)
  const ingestable = [], flagged = [];
  for (const d of docs) {
    const shiurID = String(d.shiurid);
    const { pairs, tags } = docToPairs(d);
    let cat;
    if (SHIUR_OVERRIDES[shiurID]) {
      const ov = SHIUR_OVERRIDES[shiurID];
      cat = { flag: null, primary: ov.primary, placements: ov.placements, confidence: ov.confidence, candidates: [] };
    } else {
      cat = categorize({ pairs, title: d.shiurtitle || '' }, isLeaf);
    }
    const entry = {
      shiurID, title: d.shiurtitle || '', tags,
      placements: cat.placements, primary: cat.primary,
      confidence: cat.confidence, flag: cat.flag,
      url: d.shiururl || '',
    };
    if (cat.flag) flagged.push(entry); else ingestable.push(entry);
  }

  // tag-key tally for the unmapped report
  const flagTally = {};
  for (const f of flagged) flagTally[f.flag.split(' ')[0]] = (flagTally[f.flag.split(' ')[0]] || 0) + 1;

  console.log(`\n  categorized: ${ingestable.length} ingestable | ${flagged.length} flagged-for-review`);
  console.log('  flag breakdown:');
  for (const [k, v] of Object.entries(flagTally).sort((a, b) => b[1] - a[1])) console.log(`    ${v}x  ${k}`);

  // namespace breakdown of ingestable
  const nsTally = {};
  for (const e of ingestable) { const ns = topNs(e.primary) || '?'; nsTally[ns] = (nsTally[ns] || 0) + 1; }
  console.log('  ingestable by top namespace:');
  for (const [k, v] of Object.entries(nsTally).sort((a, b) => b[1] - a[1])) console.log(`    ${v}x  ${k}`);

  // always (re)write the flagged-for-review list so a human/LLM pass can use it
  writeJson(FLAGGED_PATH, flagged);
  console.log(`\n  wrote flagged-for-review list -> ${FLAGGED_PATH} (${flagged.length})`);

  if (DRY_RUN) {
    console.log('\nDRY RUN complete — no media downloaded, no files written to lectures.json.');
    console.log('Review the counts above + migrate-flagged.json, then run without --dry-run.');
    return;
  }

  // ── REAL RUN ──
  // backup once
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backup = LECTURES_PATH.replace('.json', `.backup-migrate-${stamp}.json`);
  fs.copyFileSync(LECTURES_PATH, backup);
  console.log(`\n[backup] ${LECTURES_PATH} -> ${backup}`);

  const checkpoint = readJson(CHECKPOINT_PATH, {});
  const failures = readJson(FAILURES_PATH, []);
  const r2 = makeR2();

  // seed checkpoint with categorization (don't clobber existing statuses)
  for (const e of ingestable) {
    if (!checkpoint[e.shiurID]) checkpoint[e.shiurID] = { status: 'pending', placements: e.placements };
  }
  for (const f of flagged) {
    if (!checkpoint[f.shiurID] || checkpoint[f.shiurID].status === 'pending')
      checkpoint[f.shiurID] = { status: 'flagged', flag: f.flag };
  }

  // work list: retry-mode reprocesses failed ids (including ones we've since
  // given up on — that's an explicit ask); otherwise pending/failed ingestable,
  // excluding ones we've given up retrying (see SKIP_AFTER_ATTEMPTS below).
  let work;
  if (RETRY) {
    const failIds = new Set(failures.map((f) => String(f.shiurID)));
    work = ingestable.filter((e) => failIds.has(e.shiurID));
    console.log(`[retry] ${work.length} previously-failed ids to reprocess`);
  } else {
    work = ingestable.filter((e) => {
      const st = checkpoint[e.shiurID]?.status;
      return st !== 'done' && st !== 'skipped';
    });
  }
  if (Number.isFinite(LIMIT)) work = work.slice(0, LIMIT);

  // A shiur that fails the same way every day (e.g. the source file on YUTorah
  // has no audio) will never fix itself on retry — after this many failed
  // attempts, stop retrying it automatically and mark it 'skipped' so it
  // stops showing up as a fresh failure in every day's summary. --retry-failures
  // still reprocesses it (explicit ask), e.g. after YUTorah fixes the source.
  const SKIP_AFTER_ATTEMPTS = 3;
  let added = 0, dup = 0, failed = 0, skipped = 0;
  const newFailures = [];
  const fmtDur = (s) => `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
  const runStart = Date.now();
  const perShiurSecs = []; // successful ingests only, for a clean average/ETA
  console.log(`\nProcessing ${work.length} shiurim (atomic write + checkpoint after EACH)...\n`);

  for (let i = 0; i < work.length; i++) {
    const e = work[i];
    const tag = `(${i + 1}/${work.length}) ${e.shiurID}`;
    const t0 = Date.now();
    try {
      const res = await ingestShiur({
        shiurID: e.shiurID, placements: e.placements,
        tags: e.tags.map((t) => t.split(':').pop().trim()), // normalize "Ns: Val" -> "Val"
        data, r2, log: (m) => process.stdout.write(`\r  ${m}`.padEnd(110)),
      });
      const secs = (Date.now() - t0) / 1000;
      perShiurSecs.push(secs);
      checkpoint[e.shiurID] = { status: 'done', r2Key: res.r2Key, placements: res.placements, insertedInto: res.insertedInto, seconds: +secs.toFixed(1) };
      if (res.status === 'inserted') added++; else dup++;
      // running average + ETA over remaining work
      const avg = perShiurSecs.reduce((a, b) => a + b, 0) / perShiurSecs.length;
      const eta = avg * (work.length - (i + 1));
      console.log(`\r  ${tag} ${res.status} ${secs.toFixed(1)}s (avg ${avg.toFixed(1)}s, ETA ${fmtDur(eta)}) -> [${res.insertedInto.join(', ') || 'dup'}]`.padEnd(110));
    } catch (err) {
      failed++;
      const attempts = (checkpoint[e.shiurID]?.attempts || 0) + 1;
      const giveUp = attempts >= SKIP_AFTER_ATTEMPTS;
      const rec = { shiurID: e.shiurID, stage: err.stage || 'unknown', error: err.message, url: e.url, attempts, skipped: giveUp };
      newFailures.push(rec);
      checkpoint[e.shiurID] = {
        status: giveUp ? 'skipped' : 'failed',
        stage: rec.stage, error: rec.error, attempts, placements: e.placements,
      };
      if (giveUp) skipped++;
      const suffix = giveUp ? ` — giving up after ${attempts} attempts, won't auto-retry (use --retry-failures to force)` : ` (attempt ${attempts}/${SKIP_AFTER_ATTEMPTS})`;
      console.log(`\r  ${tag} FAILED [${rec.stage}] ${rec.error}${suffix} (${((Date.now() - t0) / 1000).toFixed(1)}s)`.padEnd(110));
    }
    // Persist after EACH shiur, lectures.json FIRST then checkpoint, so a kill
    // between the two writes makes resume re-process at most ONE shiur (the
    // dedup-by-id insert makes that harmless) — an insert is never lost.
    writeLecturesAtomic(data);
    writeJson(CHECKPOINT_PATH, checkpoint);
  }
  const totalSecs = (Date.now() - runStart) / 1000;
  const avgSecs = perShiurSecs.length ? perShiurSecs.reduce((a, b) => a + b, 0) / perShiurSecs.length : 0;

  // merge failures (dedup by shiurID; new records replace old)
  const merged = new Map(failures.map((f) => [String(f.shiurID), f]));
  for (const f of newFailures) merged.set(String(f.shiurID), f);
  // drop ones that have since succeeded
  for (const e of work) if (checkpoint[e.shiurID]?.status === 'done') merged.delete(e.shiurID);
  writeJson(FAILURES_PATH, [...merged.values()]);

  // generate static data ONCE at the end
  console.log('\n[generate] running generate-node-data.mjs ...');
  execFileSync('node', ['scripts/generate-node-data.mjs'], { stdio: 'inherit' });

  console.log('\n════════════════════════════════════════');
  console.log('  MIGRATE SUMMARY');
  console.log(`  added:        ${added}`);
  console.log(`  skipped(dup): ${dup}`);
  console.log(`  flagged:      ${flagged.length}  (see ${FLAGGED_PATH})`);
  console.log(`  failed:       ${failed}  (see ${FAILURES_PATH})`);
  console.log(`  gave up on:   ${skipped}  (source likely broken — won't auto-retry; see ${FAILURES_PATH})`);
  console.log(`  time:         ${fmtDur(totalSecs)} total | avg ${avgSecs.toFixed(1)}s/shiur (n=${perShiurSecs.length})`);
  if (avgSecs > 0) console.log(`  projected:    ~${fmtDur(avgSecs * ingestable.length)} for all ${ingestable.length} ingestable at this rate`);
  console.log(`  backup:       ${backup}`);
  console.log('════════════════════════════════════════');
  console.log('\nReview flagged + failures, rerun failures with --retry-failures, then commit when satisfied.');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
