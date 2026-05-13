// Run once: node scripts/patch-scraper2.js
// Fixes 4 issues found after the first full scrape run.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'yutorah-scraper.js');
let content = fs.readFileSync(file, 'utf8');
let changes = 0;

function replace(label, oldStr, newStr) {
  if (!content.includes(oldStr)) {
    console.warn(`  [SKIP] Already patched or not found: ${label}`);
    return;
  }
  content = content.replace(oldStr, newStr);
  console.log(`  [OK] ${label}`);
  changes++;
}

console.log('\nApplying patches to yutorah-scraper.js...\n');

// ── FIX 1: Catch-all for lectures with no category (1020x "|") ────────────────
replace(
  'Catch-all for empty category',
  `  // PERSONALITIES → existing nodes`,
  `  // CATCH-ALL: lectures with no category assigned on YUTorah
  '|': 'misc-general',

  // PERSONALITIES → existing nodes`
);

// ── FIX 2a: Route Machshava|Midrash to general child, not the folder itself ──
replace(
  'Machshava|Midrash → general child',
  `  'Machshava|Midrash':                  'discussion-midrash',`,
  `  'Machshava|Midrash':                  'discussion-midrash-general',`
);

// ── FIX 2b: Route Machshava|History to general child ─────────────────────────
replace(
  'Machshava|History → general child',
  `  'Machshava|History':                  'discussion-history',`,
  `  'Machshava|History':                  'discussion-history-general',`
);

// ── FIX 2c: Route Taaniot (fasts) to general child of fast-days ──────────────
replace(
  'Taaniot → fast-days general child',
  `  "Moadim U'Zmanim/Holidays|Taaniot (fasts)":      'holidays-fast-days',`,
  `  "Moadim U'Zmanim/Holidays|Taaniot (fasts)":      'holidays-fast-days-general',`
);

// ── FIX 2d: Route Machshava|Three Weeks to general child ─────────────────────
replace(
  'Three Weeks → general child',
  `  'Machshava|Three Weeks':              'holidays-three-weeks',`,
  `  'Machshava|Three Weeks':              'holidays-three-weeks-general',`
);

// ── FIX 3: Add Nach|Megillot mapping ─────────────────────────────────────────
replace(
  'Nach|Megillot mapping',
  `  'Nach|Chaggai':         'nach-chaggai',`,
  `  'Nach|Megillot':        'nach-megillot-general',
  'Nach|Chaggai':         'nach-chaggai',`
);

// ── FIX 4 + 2 (nodes): Add missing General children and discussion-relationships
// Insert after the existing nach-megillot-eichah entry
replace(
  'Add general lecture-holder nodes',
  `  // Other Nach`,
  `  { id: 'nach-megillot-general',             label: 'General',          parentId: 'nach-megillot',           type: 'lectures' },

  // Other Nach`
);

// Add discussion-midrash-general (already has midrash-rabbah and tanchuma children)
replace(
  'Add discussion-midrash-general',
  `  { id: 'discussion-midrash-rabbah-torah',     label: 'Midrash Rabbah - Torah',   parentId: 'discussion-midrash', type: 'lectures' },`,
  `  { id: 'discussion-midrash-general',          label: 'General',                  parentId: 'discussion-midrash', type: 'lectures' },
  { id: 'discussion-midrash-rabbah-torah',     label: 'Midrash Rabbah - Torah',   parentId: 'discussion-midrash', type: 'lectures' },`
);

// Add discussion-history-general
replace(
  'Add discussion-history-general',
  `  { id: 'discussion-history-21st-century',     label: '21st Century CE',          parentId: 'discussion-history', type: 'lectures' },`,
  `  { id: 'discussion-history-general',          label: 'General',                  parentId: 'discussion-history', type: 'lectures' },
  { id: 'discussion-history-21st-century',     label: '21st Century CE',          parentId: 'discussion-history', type: 'lectures' },`
);

// Add holidays-fast-days-general
replace(
  'Add holidays-fast-days-general',
  `  { id: 'holidays-fast-shiva-asar-btamuz',   label: "Shiva Asar B'Tamuz", parentId: 'holidays-fast-days',     type: 'lectures' },`,
  `  { id: 'holidays-fast-days-general',          label: 'General',            parentId: 'holidays-fast-days',     type: 'lectures' },
  { id: 'holidays-fast-shiva-asar-btamuz',   label: "Shiva Asar B'Tamuz", parentId: 'holidays-fast-days',     type: 'lectures' },`
);

// Add holidays-three-weeks-general
replace(
  'Add holidays-three-weeks-general',
  `  { id: 'holidays-fast-days',                label: 'Fast Days',           parentId: 'holidays-three-weeks',   type: 'folder'   },`,
  `  { id: 'holidays-three-weeks-general',       label: 'General',             parentId: 'holidays-three-weeks',   type: 'lectures' },
  { id: 'holidays-fast-days',                label: 'Fast Days',           parentId: 'holidays-three-weeks',   type: 'folder'   },`
);

// Add discussion-relationships (may be missing from some project file versions)
replace(
  'Add discussion-relationships to NEW_NODES',
  `  { id: 'discussion-ahavat-yirat-hashem',      label: 'Ahavat/Yirat Hashem',      parentId: 'discussion', type: 'lectures' },`,
  `  { id: 'discussion-relationships',            label: 'Relationships',             parentId: 'discussion', type: 'lectures' },
  { id: 'discussion-ahavat-yirat-hashem',      label: 'Ahavat/Yirat Hashem',      parentId: 'discussion', type: 'lectures' },`
);

fs.writeFileSync(file, content);
console.log(`\n${changes} patches applied.`);
console.log('\nNow re-run the scraper (dedup skips the 10928 already added):');
console.log('  node scripts/yutorah-scraper.js\n');
