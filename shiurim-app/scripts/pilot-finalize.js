#!/usr/bin/env node
// =============================================================================
// pilot-finalize.js — assemble final pilot outputs from the scrape + media
// caches, applying the user's placement (cross-listing) decisions.
// Produces: pilot-output.json, pilot-report.md  (under scripts/pilot-output/)
// =============================================================================
const fs = require('fs');
const path = require('path');

const OUT = path.join('scripts', 'pilot-output');
const scrape = JSON.parse(fs.readFileSync(path.join(OUT, '_scrape-cache.json'), 'utf8'));
const media = JSON.parse(fs.readFileSync(path.join(OUT, '_media-cache.json'), 'utf8'));
const hier = JSON.parse(fs.readFileSync(path.join('data', 'folder-hierarchy.json'), 'utf8'));
const checkpoint = JSON.parse(fs.readFileSync(path.join(OUT, 'checkpoint.json'), 'utf8'));

const byId = new Map();
(function walk(ns) { for (const n of ns) { byId.set(n.id, n); if (n.children) walk(n.children); } })(hier.categories);
const label = (id) => byId.has(id) ? byId.get(id).label : '⚠ MISSING';

// ── User decisions from the Phase-3 review ──────────────────────────────────
// primary = nodeId recorded as the lecture's main home (also placements[0]).
// placements = every node whose lectures[] should receive the identical object.
const DECISIONS = {
  '1179161': { primary: 'nach-mishlei', placements: ['nach-mishlei'],
    rule: 'Rule 1: Nach tag', confidence: 'high', alternates: [] },
  '1179108': { primary: 'nach-tehillim', placements: ['nach-tehillim'],
    rule: 'Rule 1: Nach tag', confidence: 'high', alternates: [] },
  '1151186': { primary: 'discussion-qa',
    placements: ['discussion-qa', 'holidays-rosh-hashana-yom-kippur', 'discussion-olam-haba'],
    rule: 'User decision: "Q&A" in title → Discussion/Q&A as primary, cross-listed to topic nodes (Yom Kippur, Olam Haba)',
    confidence: 'high', alternates: [] }, // Machshava: Torah → discussion-learning-chachma intentionally ignored per user
  '1180731': { primary: 'bamidbar-chukat', placements: ['bamidbar-chukat'],
    rule: 'Rule 2: Parsha tag', confidence: 'high', alternates: [] },
  '1178688': { primary: 'kisvei-rishonim-rambam-moreh-nevuchim',
    placements: ['kisvei-rishonim-rambam-moreh-nevuchim', 'nach-iyov'],
    rule: 'User decision: Rambam/Moreh Nevuchim (title "Moreh 3:17") as primary, cross-listed to nach-iyov (taught in Iyov series)',
    confidence: 'high', alternates: ['kisvei-rishonim-rambam-general'] },
};

const out = [];
for (const r of scrape) {
  const m = media[r.shiurID] || {};
  const d = DECISIONS[r.shiurID];
  const convDur = m.converted_duration_seconds != null ? Math.round(m.converted_duration_seconds) : null;
  out.push({
    // ── exact sample-lectures.json schema fields ──
    id: r.idField,
    title: r.title,
    audioUrl: null, // unknowable in a no-upload dry run (R2 URL assigned at ingest) — flagged
    duration: convDur, // seconds, from ffprobe on the final MP3
    description: r.description,
    speaker: r.speaker,
    date: r.date,
    tags: r.tags, // full "Namespace: Value" strings (normalize at real ingest)
    // ── pilot-only extra fields (strip before real ingest) ──
    nodeId: d.primary,
    placements: d.placements,           // cross-listing targets (see report §Multi-placement)
    placement_labels: d.placements.map(label),
    categorization_rule: d.rule,
    categorization_confidence: d.confidence,
    alternate_categories: d.alternates,
    rule_engine_primary: r.nodeId,      // what the literal rules produced, for transparency
    original_media_url: r.original_media_url,
    original_media_type: r.original_media_type,
    needs_ffmpeg_conversion: r.needs_ffmpeg_conversion,
    original_duration_seconds: m.original_duration_seconds != null ? Math.round(m.original_duration_seconds) : null,
    converted_duration_seconds: convDur,
    mp3_size_mb: m.mp3_size_mb ?? null,
  });
}
fs.writeFileSync(path.join(OUT, 'pilot-output.json'), JSON.stringify(out, null, 2));

// ── pilot-report.md ──────────────────────────────────────────────────────────
const fmtDur = (s) => s == null ? 'n/a' : `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s (${s}s)`;
let md = `# Rabbi Matt Schneeweiss — 5-Shiur Pilot Report\n\n`;
md += `**Dry run** — no R2 upload, no Supabase write. Local output only. Generated ${new Date().toISOString().slice(0, 10)}.\n\n`;
md += `## Results table\n\n`;
md += `| shiurID | title | tags | → primary nodeId | cross-listed placements | rule | conf | media | MP3 size | orig dur | conv dur |\n`;
md += `|---|---|---|---|---|---|---|---|---|---|---|\n`;
for (const o of out) {
  md += `| ${o.id.replace('YBT-', '')} | ${o.title.replace(/\|/g, '\\|').slice(0, 60)} | ${o.tags.join('; ')} | \`${o.nodeId}\` (${label(o.nodeId)}) | ${o.placements.map(p => '`' + p + '`').join(', ')} | ${o.categorization_rule.split(':')[0]} | ${o.categorization_confidence} | ${o.original_media_type} | ${o.mp3_size_mb ?? 'n/a'} MB | ${fmtDur(o.original_duration_seconds)} | ${fmtDur(o.converted_duration_seconds)} |\n`;
}

md += `\n## Flags\n\n`;
md += `### Categorization — conflicts & overrides\n`;
md += `- **1151186** (multi-tag conflict): literal rules produced \`${scrape.find(s => s.shiurID === '1151186').nodeId}\` (Rule 3, Holiday). **Overridden** per your decision to \`discussion-qa\` (any "Q&A" title → Discussion/Q&A) and **cross-listed** to \`holidays-rosh-hashana-yom-kippur\` + \`discussion-olam-haba\`. The third tag (\`Machshava: Torah\` → \`discussion-learning-chachma\`) is **intentionally ignored** per your instruction.\n`;
md += `- **1178688** (multi-tag conflict): literal rules produced \`${scrape.find(s => s.shiurID === '1178688').nodeId}\` (Rule 1, Nach:Iyov, high). **Overridden** per your decision to primary \`kisvei-rishonim-rambam-moreh-nevuchim\` and **cross-listed** to \`nach-iyov\`. Alternate (not placed): \`kisvei-rishonim-rambam-general\`.\n`;
md += `- The other three (1179161, 1179108, 1180731) matched expected on the literal rules — no override.\n\n`;
md += `### nodeId: null (no hierarchy match)\n- None. All ${out.length} primary nodeIds and all cross-list placements resolve to existing nodes in folder-hierarchy.json.\n\n`;
md += `### Schema fields set to null\n- \`audioUrl\` is **null for all 5** — expected for a no-upload dry run; the R2 URL is assigned only at real ingest after upload. \`original_media_url\` holds the working source URL.\n\n`;
md += `### Duration drift (>5s) after MP4→MP3 conversion\n`;
const drifters = out.filter(o => o.original_duration_seconds != null && o.converted_duration_seconds != null && Math.abs(o.original_duration_seconds - o.converted_duration_seconds) > 5);
md += drifters.length ? drifters.map(o => `- ${o.id}: ${Math.abs(o.original_duration_seconds - o.converted_duration_seconds)}s drift\n`).join('') : `- None. All conversions within 5s of source (most 0s).\n`;
md += `\n### Media type note\n- **1180731 is already MP3** (audio) — no ffmpeg conversion. The other 4 were MP4 (video) → converted to MP3 (libmp3lame -q:a 3).\n\n`;
md += `### URL pattern (incl. shiur 1178688)\n`;
md += `- Pattern observed for **all 5**: \`https://download.yutorah.org/{YEAR}/248687/{SHIUR_ID}.{EXT}\`. The **\`248687\` teacher folder holds for all 5** ✓.\n`;
md += `- **Deviations from the spec pattern \`…/{YEAR}/248687/{SHIUR_ID}/…\`:** (a) no trailing \`/{SHIUR_ID}/\` directory — the file is \`{SHIUR_ID}.{EXT}\` directly; (b) \`248687\` is **not** the API \`teacherid\` (which is \`83858\`) — it's a separate download/teacher folder id; (c) \`download.yutorah.org\` **302-redirects to a Cloudflare R2 bucket** (\`pub-118b5aaf…r2.dev\`). YEAR folder = the shiur's calendar year (2026, except 1151186 = 2025).\n\n`;
md += `### Data-source deviation (important)\n`;
md += `- The spec assumed \`lecture.cfm\` pages are reachable via Playwright. In reality those pages are behind a Cloudflare **managed** bot challenge that blocked headless **and** headed Playwright (even with anti-automation flags + reload). Phase-1 data was instead sourced from \`classic.yutorah.org/search/_get_search_results.cfm?search_query={id}\`, which answers plain server \`fetch\` with authoritative structured metadata (the same endpoint the production scraper uses). "Raw URL snippet" therefore = the API \`shiururl\` field, not page HTML.\n\n`;

md += `## Alias map used\n\n`;
md += `| variant encountered | resolved to | where | needed? |\n|---|---|---|---|\n`;
md += `| \`Tehilim\` (in title of 1179108) | \`Tehillim\` | title spelling | **No** at tag level — the tag was already \`Nach: Tehillim\` |\n`;
md += `| \`Chukas\` (in title of 1180731) | \`Chukat\` | title spelling | **No** at tag level — the tag was already \`Parsha: Chukat\` |\n`;
md += `| \`Olam Habah\` (tag of 1151186) | \`discussion-olam-haba\` (label "Olam Haba") | tag value | **Yes** — value→node alias (label drops trailing "h") |\n`;
md += `| \`Yom Kippur\` (Halacha tag of 1151186) | \`holidays-rosh-hashana-yom-kippur\` | tag value | **Yes** — holiday value→node map (no single "Yom Kippur" node; lives under combined RH&YK node) |\n`;
md += `| \`Rambam\` / \`Moreh\` (tag+title of 1178688) | \`kisvei-rishonim-rambam-moreh-nevuchim\` | keyword | **Yes** — Rishonim keyword map |\n\n`;
md += `*Wired but unused this pilot (kept for the full run):* \`koheles→kohelet\`, \`shir hashirim→shir hashirim\`, plus the full holiday value map.\n\n`;

md += `## Multi-placement (cross-listing) — how real ingest must apply it\n\n`;
md += `Two shiurim are cross-listed. The site supports this natively (verified against \`scripts/generate-node-data.mjs\` and \`scripts/fix-duplicate-ids.js\`):\n\n`;
md += `1. Insert the **identical lecture object — same \`id\`** — into the \`lectures[]\` array of **each** node in \`placements\`.\n`;
md += `2. \`generate-node-data.mjs\` writes one \`{nodeId}.json\` per node, so the shiur appears on every placed browse page.\n`;
md += `3. \`catalog.json\` (search) **dedupes by id** ("first occurrence wins" in tree-traversal order), so search shows it once and React keys never collide. Speaker counts are taken from the deduped catalog, so no double-count.\n`;
md += `4. \`fix-duplicate-ids.js\` dedupes only **within a single node** (fresh seen-set per node), so it will **not** clobber cross-listed copies in different nodes.\n\n`;
md += `> ⚠ **Traversal-order caveat:** the search-result breadcrumb shows the *first* node reached in traversal (categories in array order, depth-first, lectures-before-children), which is **not** necessarily \`placements[0]\`. For 1151186, \`discussion-olam-haba\` is traversed before \`discussion-qa\` within the Discussion subtree, so search would label it "Olam Haba" even though Q&A is the intended primary. It still appears in all placed nodes; only the search breadcrumb differs. Decide if that matters before the full run.\n\n`;
md += `## Per-shiur detail\n\n`;
for (const o of out) {
  md += `### ${o.id} — ${o.title}\n`;
  md += `- date: ${o.date} | speaker: ${o.speaker} | duration: ${fmtDur(o.duration)}\n`;
  md += `- tags: ${o.tags.map(t => '`' + t + '`').join(', ')}\n`;
  md += `- placements: ${o.placements.map(p => `\`${p}\` (${label(p)})`).join(', ')}\n`;
  md += `- rule: ${o.categorization_rule} [${o.categorization_confidence}]\n`;
  md += `- source URL: ${o.original_media_url} (${o.original_media_type})\n`;
  md += `- MP3: ${o.mp3_size_mb ?? 'n/a'} MB | orig ${fmtDur(o.original_duration_seconds)} → conv ${fmtDur(o.converted_duration_seconds)}\n\n`;
}

fs.writeFileSync(path.join(OUT, 'pilot-report.md'), md);

// Final checkpoint sanity
console.log('Wrote pilot-output.json and pilot-report.md');
console.log('\nCheckpoint statuses:');
for (const [id, c] of Object.entries(checkpoint)) console.log(`  ${id}: ${c.status}${c.error ? ' (' + c.error + ')' : ''}`);
console.log('\npilot-media/:');
for (const f of fs.readdirSync(path.join(OUT, 'pilot-media'))) {
  const sz = fs.statSync(path.join(OUT, 'pilot-media', f)).size;
  console.log(`  ${f}  ${(sz / 1e6).toFixed(2)} MB`);
}
