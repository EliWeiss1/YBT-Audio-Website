#!/usr/bin/env node
// =============================================================================
// pilot-scrape.js — Phase 1 (scrape) + Phase 2 (categorize) for the
// Rabbi Matt Schneeweiss 5-shiur pilot.
//
// NOTE ON DATA SOURCE: The pilot spec asked for Playwright page-scraping of
// https://www.yutorah.org/lectures/lecture.cfm/{id}. In practice those pages are
// behind a Cloudflare *managed* bot challenge ("Just a moment…", Ray ID) that
// blocks BOTH plain server fetch AND headless/headed Playwright (even with
// --disable-blink-features=AutomationControlled + stealth + reload). The
// classic.yutorah.org search API, however, accepts plain server requests and
// returns authoritative structured metadata (title, date, duration, category/
// subcategory tags, teacher, description, and the download URL). This is the
// same endpoint the production scraper (scripts/yutorah-scraper.js) uses. We
// therefore source Phase-1 data from that API and record this deviation.
//
// Writes (under scripts/pilot-output/):
//   _scrape-cache.json   full intermediate (consumed by pilot-download.js)
//   checkpoint.json      per-shiur status
// Prints the Phase-3 review table + conflict analysis, then STOPS.
// =============================================================================

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join('scripts', 'pilot-output');
const HIER_PATH = path.join('data', 'folder-hierarchy.json');
const API_BASE = 'https://classic.yutorah.org/search/_get_search_results.cfm';
const DL_HOST = 'https://download.yutorah.org';
const SPEAKER = 'Rabbi Matt Schneeweiss';

const PILOT = [
  { id: '1179161', expected: 'Nach/Mishlei' },
  { id: '1179108', expected: 'Nach/Tehillim' },
  { id: '1151186', expected: 'Discussion/… (conflict test)' },
  { id: '1180731', expected: 'Chumash/Bamidbar/Chukat' },
  { id: '1178688', expected: 'Kisvei Rishonim (Rambam Moreh Nevuchim)' },
];

// ─── HIERARCHY RESOLVER ──────────────────────────────────────────────────────
const hier = JSON.parse(fs.readFileSync(HIER_PATH, 'utf8'));
const byId = new Map();          // id -> node
const parentChain = new Map();   // id -> [ancestor ids root..self]
(function walk(nodes, chain) {
  for (const n of nodes) {
    const c = [...chain, n.id];
    byId.set(n.id, n);
    parentChain.set(n.id, c);
    if (n.children) walk(n.children, c);
  }
})(hier.categories, []);

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/['’`"]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

// Find a descendant of rootId whose label matches targetLabel (normalized).
function findDescendantByLabel(rootId, targetLabel) {
  const target = norm(targetLabel);
  for (const [id, node] of byId) {
    const chain = parentChain.get(id);
    if (!chain.includes(rootId) || id === rootId) continue;
    if (norm(node.label) === target) return id;
  }
  return null;
}
const exists = (id) => id && byId.has(id);

// ─── ALIAS MAPS ──────────────────────────────────────────────────────────────
const NACH_ALIAS = { 'tehilim': 'tehillim', 'shir hashirim': 'shir hashirim', 'koheles': 'kohelet' };
const PARSHA_ALIAS = { 'chukas': 'chukat', 'beshalised': 'beshalach' };
// holiday value (normalized) -> holidays nodeId
const HOLIDAY_NODE = {
  'yom kippur': 'holidays-rosh-hashana-yom-kippur',
  'rosh hashana': 'holidays-rosh-hashana-yom-kippur',
  'rosh hashanah': 'holidays-rosh-hashana-yom-kippur',
  'yamim noraim': 'holidays-rosh-hashana-yom-kippur',
  'chanukah': 'holidays-chanukah',
  'purim': 'holidays-purim-purim',
  'pesach': 'holidays-pesach',
  'shavuos': 'holidays-shavuos', 'shavuot': 'holidays-shavuos',
  'sukkos': 'holidays-sukkos', 'sukkot': 'holidays-sukkos',
  'tisha bav': 'holidays-tisha-bav',
  'elul': 'holidays-elul',
};
const HOLIDAY_VALUES = new Set(Object.keys(HOLIDAY_NODE));
// topical Machshava/Halacha value (normalized) -> discussion nodeId
const DISCUSSION_NODE = {
  'olam habah': 'discussion-olam-haba', 'olam haba': 'discussion-olam-haba',
  'torah': 'discussion-learning-chachma',
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
  return 'kisvei-rishonim'; // generic top — flagged as non-leaf
}

const CONF_RANK = { high: 3, medium: 2, low: 1 };

// ─── CATEGORIZER (pilot rules, priority order) ───────────────────────────────
function categorize({ pairs, title }) {
  const cands = [];
  const aliases = [];
  for (const { ns, val } of pairs) {
    const nsn = norm(ns), valn = norm(val);
    if (nsn === 'nach') {
      const lbl = NACH_ALIAS[valn] || valn;
      if (NACH_ALIAS[valn]) aliases.push(`Nach value "${val}" → "${lbl}"`);
      cands.push({ rule: 1, ruleName: 'Rule 1: Nach tag', conf: 'high', nodeId: findDescendantByLabel('nach', lbl), via: `Nach: ${val}` });
    } else if (nsn === 'parsha') {
      const lbl = PARSHA_ALIAS[valn] || valn;
      if (PARSHA_ALIAS[valn]) aliases.push(`Parsha value "${val}" → "${lbl}"`);
      cands.push({ rule: 2, ruleName: 'Rule 2: Parsha tag', conf: 'high', nodeId: findDescendantByLabel('chumash', lbl), via: `Parsha: ${val}` });
    } else if ((nsn === 'halacha' || nsn === 'machshava') && HOLIDAY_VALUES.has(valn)) {
      cands.push({ rule: 3, ruleName: 'Rule 3: Holiday Halacha/Machshava tag', conf: 'medium', nodeId: HOLIDAY_NODE[valn] || null, via: `${ns}: ${val}` });
    } else if (nsn === 'machshava' || nsn === 'halacha') {
      if (RISHONIM_RE.test(valn)) {
        cands.push({ rule: 4, ruleName: 'Rule 4: Rishonim keyword (tag)', conf: 'medium', nodeId: resolveRishonim(valn), via: `${ns}: ${val}` });
      } else {
        const id = DISCUSSION_NODE[valn] || findDescendantByLabel('discussion', valn);
        cands.push({ rule: 5, ruleName: 'Rule 5: Topical Machshava/Halacha → Discussion', conf: 'medium', nodeId: id, via: `${ns}: ${val}` });
      }
    } else if (nsn === 'mishna' || nsn === 'gemara') {
      cands.push({ rule: 6, ruleName: 'Rule 6: Mishna/Gemara → Kisvei Chazal', conf: 'medium', nodeId: 'kisvei-chazal-all', via: `${ns}: ${val}` });
    }
  }
  // Title-based Rule 4 (Rishonim keyword in title)
  if (RISHONIM_RE.test(norm(title))) {
    cands.push({ rule: 4, ruleName: 'Rule 4: Rishonim keyword (title)', conf: 'medium', nodeId: resolveRishonim(title), via: `title: "${title}"` });
  }
  // Fallback
  if (cands.length === 0) {
    cands.push({ rule: 7, ruleName: 'Rule 7: Fallback', conf: 'low', nodeId: 'discussion-rabbi-schneeweiss', via: 'no confident match' });
  }
  // Choose primary: highest confidence tier, then lowest rule number.
  const sorted = [...cands].sort((a, b) =>
    (CONF_RANK[b.conf] - CONF_RANK[a.conf]) || (a.rule - b.rule));
  const primary = sorted[0];
  const alternates = [];
  for (const c of sorted.slice(1)) {
    if (c.nodeId && c.nodeId !== primary.nodeId && !alternates.includes(c.nodeId)) alternates.push(c.nodeId);
  }
  return { primary, alternates, allCandidates: sorted, aliases };
}

// ─── API FETCH ───────────────────────────────────────────────────────────────
const arr = (v) => Array.isArray(v) ? v : (v == null || v === '' ? [] : [v]);
async function fetchShiur(id) {
  const r = await fetch(`${API_BASE}?search_query=${id}&page=1`);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  const docs = j.response?.docs || [];
  const d = docs.find((x) => String(x.shiurid) === String(id)) || docs[0];
  if (!d) throw new Error(`not found (numFound=${j.response?.numFound})`);
  return d;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
(async () => {
  const results = [];
  const checkpoint = {};
  for (const { id, expected } of PILOT) {
    try {
      const d = await fetchShiur(id);
      const cats = arr(d.categoryname);
      const subs = arr(d.subcategoryname);
      const n = Math.max(cats.length, subs.length);
      const pairs = [];
      const tags = [];
      for (let i = 0; i < n; i++) {
        const ns = cats[i] || cats[0] || '';
        const val = subs[i] || '';
        if (val) { pairs.push({ ns, val }); tags.push(`${ns}: ${val}`); }
      }
      const shiururl = d.shiururl || '';
      const mediaUrl = shiururl ? (shiururl.startsWith('http') ? shiururl : DL_HOST + shiururl) : null;
      const ext = (shiururl.split('.').pop() || '').toLowerCase();
      const mediaType = ext === 'mp3' ? 'mp3' : (ext === 'mp4' ? 'mp4' : ext || null);
      const date = (d.shiurdate || '').substring(0, 10);
      const durationSec = Math.round((parseFloat(d.duration) || 0) * 60);

      const cat = categorize({ pairs, title: d.shiurtitle || '' });
      const rec = {
        shiurID: id,
        expected,
        // schema fields
        idField: `YBT-${id}`,
        title: d.shiurtitle || '',
        speaker: SPEAKER,
        date,
        duration_provisional_sec: durationSec, // finalized by ffprobe after download
        description: d.shiurdescription || '',
        tags,
        // media
        original_media_url: mediaUrl,
        original_media_type: mediaType,
        needs_ffmpeg_conversion: mediaType === 'mp4',
        media_bytes: null,
        // categorization
        nodeId: cat.primary.nodeId,
        nodeId_exists: exists(cat.primary.nodeId),
        nodeId_label: exists(cat.primary.nodeId) ? byId.get(cat.primary.nodeId).label : null,
        categorization_rule: cat.primary.ruleName,
        categorization_confidence: cat.primary.conf,
        alternate_categories: cat.alternates,
        candidates: cat.allCandidates,
        aliases_used: cat.aliases,
        api_raw: { categoryname: cats, subcategoryname: subs, teacherid: d.teacherid, mediatypename: d.mediatypename },
      };
      results.push(rec);
      checkpoint[id] = {
        status: 'scraped',
        error: null,
        mediaPath: null,
        nodeId: rec.nodeId,
        categorization_rule: rec.categorization_rule,
        categorization_confidence: rec.categorization_confidence,
      };
    } catch (e) {
      results.push({ shiurID: id, expected, failed: true, error: e.message });
      checkpoint[id] = { status: 'failed', error: e.message };
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, '_scrape-cache.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'checkpoint.json'), JSON.stringify(checkpoint, null, 2));

  // ── Phase 3 review table ──
  const cell = (s, w) => String(s == null ? '' : s).padEnd(w).slice(0, w);
  console.log('\n================ PHASE 3 — REVIEW (no media downloaded yet) ================\n');
  const cols = [['shiurID', 8], ['title', 40], ['tags', 34], ['→ nodeId', 34], ['exists', 6], ['rule', 30], ['conf', 6], ['media', 5]];
  console.log(cols.map(([h, w]) => cell(h, w)).join(' | '));
  console.log(cols.map(([, w]) => '-'.repeat(w)).join('-+-'));
  for (const r of results) {
    if (r.failed) { console.log(cell(r.shiurID, 8) + ' | FAILED: ' + r.error); continue; }
    console.log([
      cell(r.shiurID, 8), cell(r.title, 40), cell(r.tags.join('; '), 34),
      cell(r.nodeId, 34), cell(r.nodeId_exists ? 'yes' : 'NO', 6),
      cell(r.categorization_rule, 30), cell(r.categorization_confidence, 6),
      cell(r.original_media_type, 5),
    ].join(' | '));
  }
  console.log('\nFull URL snippets + candidate breakdown:\n');
  for (const r of results) {
    if (r.failed) continue;
    console.log(`• ${r.shiurID}  "${r.title}"`);
    console.log(`    expected : ${r.expected}`);
    console.log(`    URL      : ${r.original_media_url}  (${r.original_media_type}${r.needs_ffmpeg_conversion ? ', NEEDS MP4→MP3' : ', already mp3'})`);
    console.log(`    primary  : ${r.nodeId} (${r.nodeId_label || 'NODE MISSING'}) — ${r.categorization_rule} [${r.categorization_confidence}]`);
    if (r.alternate_categories.length) console.log(`    alts     : ${r.alternate_categories.join(', ')}`);
    if (r.aliases_used.length) console.log(`    aliases  : ${r.aliases_used.join(' | ')}`);
    console.log(`    fired    : ${r.candidates.map(c => `${c.ruleName.split(':')[0]}→${c.nodeId}[${c.conf}]`).join('  ')}`);
    console.log('');
  }
  console.log('Wrote _scrape-cache.json + checkpoint.json. STOPPING for review before downloads.\n');
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
