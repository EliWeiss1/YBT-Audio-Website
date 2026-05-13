/**
 * fix-empty-nodes.js
 * For each empty lecture node in lectures.json:
 *   1. Queries YUTorah API for that subcategory
 *   2. If lecture already exists in JSON (misrouted) → moves it to correct node
 *   3. If lecture not in JSON at all → adds it fresh
 *
 * Run from project root:
 *   node scripts/fix-empty-nodes.js --test   # preview only, no writes
 *   node scripts/fix-empty-nodes.js           # apply fixes
 */

const fs   = require('fs');
const path = require('path');

const args      = process.argv.slice(2);
const isTest    = args.includes('--test');
const inputIdx  = args.indexOf('--input');
const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : path.join('data', 'lectures.json');
const BACKUP    = inputPath.replace('.json', '.backup-fix-empty.json');

const ORG_ID   = 367;
const DATE_CAP = '2030-01-01T00:00:00Z';
const API_BASE = 'https://classic.yutorah.org/search/_get_search_results.cfm';

// ─── Map: node ID → YUTorah query params ─────────────────────────────────────
// cat: category name on YUTorah, subcat: subcategory name
// Skip holidays-archived (catch-all, no YUTorah equivalent)
const NODE_QUERIES = [
  { nodeId: 'chumash-arba-parshiyot-shekalim',  cat: 'Parsha',                      subcat: 'Shekalim' },
  { nodeId: 'discussion-history-21st-century',  cat: 'History',                     subcat: '21st Century CE' },
  { nodeId: 'discussion-midrash-tanchuma',      cat: 'Midrash',                     subcat: 'Midrash Tanchuma' },
  // halacha-bechorot removed — YUTorah results were all mismatches
  { nodeId: 'halacha-birchot-hatorah',          cat: 'Halacha',                     subcat: 'Birchot HaTorah' },
  { nodeId: 'halacha-chinuch',                  cat: 'Halacha',                     subcat: 'Chinuch',
    requiresExclusiveSubcat: false, skipIds: ['YBT-804938'] },
  { nodeId: 'halacha-hachnasat-orchim',         cat: 'Halacha',                     subcat: 'Hachnasat Orchim' },
  { nodeId: 'halacha-kohanim',                  cat: 'Halacha',                     subcat: 'Kohanim',
    skipIds: ['YBT-960534'] },
  { nodeId: 'halacha-medical-ethics',           cat: 'Halacha',                     subcat: 'Medical Ethics' },
  { nodeId: 'halacha-rules-of-psak',            cat: 'Halacha',                     subcat: 'Rules of Psak' },
  { nodeId: 'halacha-sheva-mitzvot-bnei-noach', cat: 'Halacha',                     subcat: "Sheva Mitzvot B'nei Noach" },
  // halacha-shofar removed — YUTorah results were all mismatches
  { nodeId: 'halacha-women',                    cat: 'Halacha',                     subcat: 'Women',
    skipIds: ['YBT-1167768'] },
  { nodeId: 'holidays-pesach-pesach-sheni',     cat: "Moadim U'Zmanim/Holidays",    subcat: 'Pesach Sheni' },
  // holidays-chol-hamoed removed — YUTorah results were all mismatches
  { nodeId: 'holidays-fast-tzom-gedalia',       cat: 'Machshava',                   subcat: 'Tzom Gedalia' },
  { nodeId: 'nach-divrei-hayamim',              cat: 'Nach',                        subcat: 'Divrei Hayamim',
    // Only add if primary subcat — skip lectures whose primary home is elsewhere
    requiresExclusiveSubcat: true },
  // nach-ezra-nechemia skipped — API hangs on '&' in subcategory name; no results confirmed
  { nodeId: 'nach-general',                     cat: 'Nach',                        subcat: 'General' },
  { nodeId: 'nach-yechezkel',                   cat: 'Nach',                        subcat: 'Yechezkel' },
  { nodeId: 'nach-yeshayahu',                   cat: 'Nach',                        subcat: 'Yeshayahu' },
  { nodeId: 'gemarah-meilah',                   cat: 'Gemara',                      subcat: 'Meilah' },
  { nodeId: 'mishna-general',                   cat: 'Mishna',                      subcat: 'General' },
  { nodeId: 'mishna-bava-batra',                cat: 'Mishna',                      subcat: 'Bava Batra' },
  { nodeId: 'mishna-bechorot',                  cat: 'Mishna',                      subcat: 'Bechorot' },
  { nodeId: 'mishna-bikkurim',                  cat: 'Mishna',                      subcat: 'Bikkurim' },
  { nodeId: 'mishna-ketuvot',                   cat: 'Mishna',                      subcat: 'Ketuvot',  skipIds: ['YBT-881838'] },
  { nodeId: 'mishna-megillah',                  cat: 'Mishna',                      subcat: 'Megillah', skipIds: ['YBT-1169066'] },
];

// ─── API helpers ──────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllForSubcat(cat, subcat) {
  const results = [];
  let page = 1;
  let retries = 0;
  const MAX_RETRIES = 3;
  while (true) {
    await sleep(1500);
    const fq  = `shiurdate:[* TO ${DATE_CAP}] AND subcategoryname:"${subcat}"`;
    const url = `${API_BASE}?organizationID=${ORG_ID}&sort_by=shiurdate+desc&search_query=&page=${page}&facet_query=${encodeURIComponent(fq)}`;
    try {
      const res  = await fetch(url);
      const text = await res.text();
      if (text.trim().startsWith('<')) {
        retries++;
        if (retries >= MAX_RETRIES) { console.log(`\n    [gave up after ${MAX_RETRIES} retries]`); break; }
        console.log(`    [rate limited, retrying in 10s... attempt ${retries}/${MAX_RETRIES}]`);
        await sleep(10000);
        continue;
      }
      retries = 0;
      const json  = JSON.parse(text);
      const docs  = json.response?.docs || [];
      const total = json.response?.numFound || 0;
      // Filter to only docs that actually have the expected category
      const filtered = docs.filter(d => {
        const docCats = [].concat(d.categoryname || []).map(s => s.trim());
        return docCats.includes(cat);
      });
      results.push(...filtered);
      if (results.length >= total || docs.length === 0) break;
      page++;
    } catch(e) {
      console.log(`    [error: ${e.message}, retrying in 5s...]`);
      await sleep(5000);
    }
  }
  return results;
}

// ─── Tree helpers ─────────────────────────────────────────────────────────────
function findNode(categories, id) {
  for (const node of categories) {
    if (node.id === id) return node;
    if (node.children) {
      const found = findNode(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function extractLecture(categories, lectureId) {
  for (const node of categories) {
    if (Array.isArray(node.lectures)) {
      const idx = node.lectures.findIndex(l => l.id === lectureId);
      if (idx !== -1) {
        const [lecture] = node.lectures.splice(idx, 1);
        return { lecture, fromNode: node.id };
      }
    }
    if (node.children) {
      const result = extractLecture(node.children, lectureId);
      if (result) return result;
    }
  }
  return null;
}

function buildExistingIdMap(categories) {
  const map = new Map(); // id → nodeId
  function walk(nodes) {
    for (const n of nodes) {
      if (n.lectures) n.lectures.forEach(l => map.set(l.id, n.id));
      if (n.children) walk(n.children);
    }
  }
  walk(categories);
  return map;
}

function str(val) {
  if (Array.isArray(val)) return (val[0] || '').trim();
  return (val || '').trim();
}

function buildLecture(doc) {
  const rawDate    = doc.shiurdate || '';
  const date       = rawDate ? rawDate.substring(0, 10) : '';
  const durationS  = Math.round((parseFloat(doc.duration) || 0) * 60);
  const subcats    = [].concat(doc.subcategoryname || []).map(s => s.trim());
  const series     = doc.seriesname || '';
  const tags       = [...subcats];
  if (series) tags.push(series);
  const url        = doc.shiururl
    ? (doc.shiururl.startsWith('http') ? doc.shiururl : `https://download.yutorah.org${doc.shiururl}`)
    : '';
  return {
    id:          `YBT-${doc.shiurid}`,
    title:       doc.shiurtitle || '',
    audioUrl:    url,
    duration:    durationS,
    description: doc.shiurdescription || '',
    speaker:     str(doc.teacherfullname),
    date,
    tags,
    sourceId:    doc.shiurid,
  };
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n========================================`);
  console.log(isTest ? '  Fix Empty Nodes — TEST MODE' : '  Fix Empty Nodes — FULL MODE');
  console.log(`========================================\n`);

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { categories } = data;
  const idMap = buildExistingIdMap(categories);

  let totalMoved = 0, totalAdded = 0, totalSkipped = 0, totalNone = 0;

  for (const { nodeId, cat, subcat, requiresExclusiveSubcat, skipIds } of NODE_QUERIES) {
    process.stdout.write(`\n[${nodeId}] querying "${cat}|${subcat}"... `);
    await sleep(2000); // extra pause between nodes to avoid rate limiting
    const docs = await fetchAllForSubcat(cat, subcat);
    console.log(`${docs.length} results`);

    if (docs.length === 0) { totalNone++; continue; }

    for (const doc of docs) {
      const lectureId = `YBT-${doc.shiurid}`;

      // Skip explicitly excluded IDs
      if (skipIds && skipIds.includes(lectureId)) {
        if (isTest) console.log(`  SKIP (excluded) ${lectureId} "${doc.shiurtitle}"`);
        totalSkipped++;
        continue;
      }

      // For requiresExclusiveSubcat nodes (e.g. nach-divrei-hayamim):
      // only add/move if this subcat is the ONLY nach subcat on the lecture
      // (avoids pulling in "Taanis 29a" which is primarily Tisha Bav)
      if (requiresExclusiveSubcat) {
        const docSubcats = [].concat(doc.subcategoryname || []).map(s => s.trim());
        const otherNachSubcats = docSubcats.filter(s => s !== subcat && s !== 'General');
        if (otherNachSubcats.length > 0) {
          if (isTest) console.log(`  SKIP ${lectureId} "${doc.shiurtitle}" — also tagged: ${otherNachSubcats.join(', ')}`);
          totalSkipped++;
          continue;
        }
      }

      const currentNodeId = idMap.get(lectureId);

      if (isTest) {
        if (currentNodeId) {
          if (currentNodeId === nodeId) {
            console.log(`  ALREADY OK  ${lectureId} "${doc.shiurtitle}"`);
          } else {
            console.log(`  MOVE        ${lectureId} "${doc.shiurtitle}"`);
            console.log(`              ${currentNodeId} → ${nodeId}`);
          }
        } else {
          console.log(`  ADD NEW     ${lectureId} "${doc.shiurtitle}"`);
        }
        continue;
      }

      if (currentNodeId) {
        if (currentNodeId === nodeId) { totalSkipped++; continue; } // already correct
        // Move from current node to correct node
        const result = extractLecture(categories, lectureId);
        if (!result) { totalSkipped++; continue; }
        const targetNode = findNode(categories, nodeId);
        if (!targetNode || !Array.isArray(targetNode.lectures)) { totalSkipped++; continue; }
        targetNode.lectures.push(result.lecture);
        idMap.set(lectureId, nodeId);
        console.log(`  ✓ MOVED  ${lectureId} from ${result.fromNode} → ${nodeId}`);
        totalMoved++;
      } else {
        // New lecture — add fresh
        const targetNode = findNode(categories, nodeId);
        if (!targetNode || !Array.isArray(targetNode.lectures)) { totalSkipped++; continue; }
        const lecture = buildLecture(doc);
        targetNode.lectures.push(lecture);
        idMap.set(lectureId, nodeId);
        console.log(`  ✓ ADDED  ${lectureId} "${doc.shiurtitle}"`);
        totalAdded++;
      }
    }
  }

  if (isTest) {
    console.log('\n[TEST MODE — no changes written]\n');
    return;
  }

  fs.writeFileSync(BACKUP, JSON.stringify(data, null, 2));
  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

  console.log(`\n========================================`);
  console.log(`  Moved:    ${totalMoved}`);
  console.log(`  Added:    ${totalAdded}`);
  console.log(`  Skipped:  ${totalSkipped}`);
  console.log(`  No YUTorah results: ${totalNone}`);
  console.log(`  Saved:    ${inputPath}`);
  console.log(`  Backup:   ${BACKUP}`);
  console.log(`========================================\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
