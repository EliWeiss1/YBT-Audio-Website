/**
 * delete-empty-nodes.js
 * Removes leaf nodes with zero lectures from lectures.json.
 * Run AFTER fix-empty-nodes.js to clean up confirmed-empty nodes.
 *
 *   node scripts/delete-empty-nodes.js --test   # preview
 *   node scripts/delete-empty-nodes.js           # apply
 */

const fs   = require('fs');
const path = require('path');

const args      = process.argv.slice(2);
const isTest    = args.includes('--test');
const inputIdx  = args.indexOf('--input');
const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : path.join('data', 'lectures.json');
const BACKUP    = inputPath.replace('.json', '.backup-delete-empty.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
let removed = 0;

function cleanChildren(nodes) {
  const kept = [];
  for (const n of nodes) {
    if (n.children) {
      n.children = cleanChildren(n.children);
      kept.push(n); // always keep folder nodes even if empty
    } else if (Array.isArray(n.lectures)) {
      if (n.lectures.length === 0) {
        console.log(`  ${isTest ? '[WOULD DELETE]' : '[DELETED]'} ${n.id} | ${n.label}`);
        removed++;
      } else {
        kept.push(n);
      }
    } else {
      kept.push(n);
    }
  }
  return kept;
}

data.categories = cleanChildren(data.categories);

console.log(`\n${isTest ? 'Would remove' : 'Removed'} ${removed} empty leaf nodes`);

if (!isTest) {
  fs.writeFileSync(BACKUP, JSON.stringify(data, null, 2));
  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
  console.log(`Saved to ${inputPath}`);
}
