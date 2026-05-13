// Run once: node scripts/patch-scraper.js
// Patches yutorah-scraper.js to handle array fields from the YUTorah API
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'yutorah-scraper.js');
let content = fs.readFileSync(file, 'utf8');

// 1. Replace resolveTargetId (which uses .trim() on potentially-array fields)
const oldRouting = `// ─── ROUTING ──────────────────────────────────────────────────────────────────
function resolveTargetId(doc) {
  const cat    = (doc.categoryname    || '').trim();
  const subcat = (doc.subcategoryname || '').trim();

  // Special: Mishna/Avot split by teacher
  if (cat === 'Mishna' && subcat === 'Avot') {
    const teacher = (doc.teacherfullname || '').trim();
    if (teacher === 'Rabbi Pesach Chait') return 'kisvei-rishonim-rambam-shemonah-perakim';
    return 'kisvei-chazal-all';
  }

  const key = \`\${cat}|\${subcat}\`;
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];

  // Fallback: try category-only
  const catKey = \`\${cat}|\`;
  if (CATEGORY_MAP[catKey]) return CATEGORY_MAP[catKey];

  return null;
}`;

const newRouting = `// ─── FIELD HELPERS (API returns strings OR arrays) ────────────────────────────
function str(val) {
  if (Array.isArray(val)) return (val[0] || '').trim();
  if (typeof val === 'string') return val.trim();
  return '';
}

// ─── ROUTING ──────────────────────────────────────────────────────────────────
function resolveTargetId(doc) {
  const cat    = str(doc.categoryname);
  const subcat = str(doc.subcategoryname);

  // Special: Mishna/Avot split by teacher
  if (cat === 'Mishna' && subcat === 'Avot') {
    const teacher = str(doc.teacherfullname);
    if (teacher === 'Rabbi Pesach Chait') return 'kisvei-rishonim-rambam-shemonah-perakim';
    return 'kisvei-chazal-all';
  }

  const key = \`\${cat}|\${subcat}\`;
  if (CATEGORY_MAP[key]) return CATEGORY_MAP[key];

  // Fallback: try category-only
  const catKey = \`\${cat}|\`;
  if (CATEGORY_MAP[catKey]) return CATEGORY_MAP[catKey];

  return null;
}`;

if (!content.includes(oldRouting)) {
  console.error('ERROR: Could not find target block to replace. Already patched?');
  process.exit(1);
}
content = content.replace(oldRouting, newRouting);

// 2. Fix unmapped key logging (uses raw array fields in template literals)
content = content.replaceAll(
  'const key = `${doc.categoryname}|${doc.subcategoryname}`;',
  'const key = `${str(doc.categoryname)}|${str(doc.subcategoryname)}`;'
);

// 3. Fix buildLecture speaker field (may also be array in some responses)
content = content.replace(
  'speaker:     doc.teacherfullname || \'\',',
  'speaker:     str(doc.teacherfullname),'
);

fs.writeFileSync(file, content);
console.log('✓ Patched successfully. Run: node scripts/yutorah-scraper.js --test');
