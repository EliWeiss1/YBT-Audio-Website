/**
 * fix-misrouted-lectures.js
 * Fetches lectures from YUTorah that were misrouted due to multi-subcategory
 * bug, finds them in lectures.json by shiurid, moves them to correct nodes.
 *
 * Run from project root:
 *   node scripts/fix-misrouted-lectures.js --test   # preview only
 *   node scripts/fix-misrouted-lectures.js           # apply fixes
 */

const fs   = require('fs');
const path = require('path');

const args      = process.argv.slice(2);
const isTest    = args.includes('--test');
const inputIdx  = args.indexOf('--input');
const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : path.join('data', 'lectures.json');
const BACKUP    = inputPath.replace('.json', '.backup-fixroute.json');

const ORG_ID   = 367;
const DATE_CAP = '2030-01-01T00:00:00Z';
const API_BASE = 'https://classic.yutorah.org/search/_get_search_results.cfm';

// ─── Subcategories to fix: these had lectures misrouted due to multi-subcat bug
// Format: { subcat, correctNode, requiredCat, onlyIfCurrentIn }
// onlyIfCurrentIn: only move if lecture is currently in one of these nodes
//   (prevents moving lectures that are already correctly placed in a valid node)
const FIXES = [
  // Divrei Hayamim removed — the 1 lecture is correctly in holidays-tisha-bav
  { subcat: 'Ezra & Nechemia', correctNode: 'nach-ezra-nechemia'  },
  { subcat: 'Birchot HaTorah', correctNode: 'halacha-birchot-hatorah',
    onlyIfCurrentIn: ['gemarah-berachot', 'halacha-brachot'] },
  { subcat: 'Pesach Sheni',    correctNode: 'holidays-pesach-pesach-sheni',
    onlyIfCurrentIn: ['pesachim', 'holidays-pesach-general'] },
  { subcat: 'Midrash Tanchuma',correctNode: 'discussion-midrash-tanchuma',
    onlyIfCurrentIn: ['discussion-midrash-general', 'discussion-general'] },
  { subcat: 'Negaim',          correctNode: 'mishna-negaim',
    requiredCat: 'Mishna' },
  { subcat: 'Challah',         correctNode: 'mishna-challah',
    requiredCat: 'Mishna' },
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchAllForSubcat(subcat) {
  const results = [];
  let page = 1;
  while (true) {
    await sleep(1500);
    const fq  = `shiurdate:[* TO ${DATE_CAP}] AND subcategoryname:"${subcat}"`;
    const url = `${API_BASE}?organizationID=${ORG_ID}&sort_by=shiurdate+desc&search_query=&page=${page}&facet_query=${encodeURIComponent(fq)}`;
    const res  = await fetch(url);
    const text = await res.text();
    if (text.trim().startsWith('<')) {
      console.log(`  [rate limited on page ${page}, retrying in 10s...]`);
      await sleep(10000);
      continue;
    }
    const json  = JSON.parse(text);
    const docs  = json.response?.docs || [];
    const total = json.response?.numFound || 0;
    results.push(...docs);
    if (results.length >= total || docs.length === 0) break;
    page++;
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

// Find and remove a lecture by id from anywhere in the tree
// Returns the lecture object if found, null otherwise
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

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n========================================`);
  console.log(isTest ? '  Fix Misrouted Lectures — TEST MODE' : '  Fix Misrouted Lectures — FULL MODE');
  console.log(`========================================\n`);

  const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const { categories } = data;

  let totalMoved = 0;
  let totalNotFound = 0;

  for (const fix of FIXES) {
    console.log(`\nFetching: subcategory="${fix.subcat}" → ${fix.correctNode}`);
    const docs = await fetchAllForSubcat(fix.subcat);
    console.log(`  Found ${docs.length} lectures on YUTorah`);

    for (const doc of docs) {
      // Skip if requiredCat specified and this doc doesn't have it
      if (fix.requiredCat) {
        const cats = [].concat(doc.categoryname || []).map(s => s.trim());
        if (!cats.includes(fix.requiredCat)) continue;
      }

      const lectureId = `YBT-${doc.shiurid}`;

      if (isTest) {
        // Just check current location
        let currentNode = 'not found';
        function findCurrent(nodes) {
          for (const n of nodes) {
            if (Array.isArray(n.lectures)) {
              if (n.lectures.find(l => l.id === lectureId)) { currentNode = n.id; return true; }
            }
            if (n.children && findCurrent(n.children)) return true;
          }
        }
        findCurrent(categories);
        const wouldSkip = fix.onlyIfCurrentIn && !fix.onlyIfCurrentIn.includes(currentNode);
        console.log(`  ${lectureId} "${doc.shiurtitle}"`);
        console.log(`    currently in: ${currentNode}  →  ${wouldSkip ? '[SKIP — already valid]' : 'move to: ' + fix.correctNode}`);
        continue;
      }

      // Extract from current location and add to correct node
      const result = extractLecture(categories, lectureId);
      if (!result) {
        console.log(`  [NOT FOUND] ${lectureId} — skipping`);
        totalNotFound++;
        continue;
      }

      // If onlyIfCurrentIn specified, verify the lecture came from an expected node
      if (fix.onlyIfCurrentIn && !fix.onlyIfCurrentIn.includes(result.fromNode)) {
        // Put it back — it was already in a valid node
        const origNode = findNode(categories, result.fromNode);
        if (origNode && Array.isArray(origNode.lectures)) origNode.lectures.push(result.lecture);
        console.log(`  [SKIP] ${lectureId} already in valid node: ${result.fromNode}`);
        continue;
      }

      const targetNode = findNode(categories, fix.correctNode);
      if (!targetNode || !Array.isArray(targetNode.lectures)) {
        console.log(`  [TARGET MISSING] ${fix.correctNode} for ${lectureId}`);
        totalNotFound++;
        continue;
      }

      targetNode.lectures.push(result.lecture);
      console.log(`  ✓ ${lectureId} moved from ${result.fromNode} → ${fix.correctNode}`);
      totalMoved++;
    }
  }

  if (isTest) {
    console.log('\nTest mode — no changes written.\n');
    return;
  }

  fs.writeFileSync(BACKUP, JSON.stringify(data, null, 2));
  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));

  console.log(`\n========================================`);
  console.log(`  Moved:     ${totalMoved}`);
  console.log(`  Not found: ${totalNotFound}`);
  console.log(`  Saved:     ${inputPath}`);
  console.log(`  Backup:    ${BACKUP}`);
  console.log(`========================================\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
