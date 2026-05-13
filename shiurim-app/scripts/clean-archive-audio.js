/**
 * clean-archive-audio.js
 * 1. Removes all YBTArchived-* lectures with .ram audio URLs
 * 2. Reports counts of remaining non-MP3 formats (wma, wav, m4a)
 *
 * Run from project root:
 *   node scripts/clean-archive-audio.js --test   # preview only, no writes
 *   node scripts/clean-archive-audio.js           # apply changes
 */

const fs = require('fs');
const path = require('path');

const args      = process.argv.slice(2);
const isTest    = args.includes('--test');
const inputIdx  = args.indexOf('--input');
const inputPath = inputIdx !== -1 ? args[inputIdx + 1] : path.join('data', 'lectures.json');
const BACKUP    = inputPath.replace('.json', '.backup-clean-audio.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

let ramRemoved  = 0;
let wmaCount    = 0;
let wavCount    = 0;
let m4aCount    = 0;

function ext(url) {
  return (url || '').split('.').pop().toLowerCase().split('?')[0];
}

function cleanNode(node) {
  if (Array.isArray(node.lectures)) {
    const before = node.lectures.length;
    node.lectures = node.lectures.filter(l => {
      const e = ext(l.audioUrl);
      if (e === 'ram') { ramRemoved++; return false; }
      if (e === 'wma') wmaCount++;
      if (e === 'wav') wavCount++;
      if (e === 'm4a') m4aCount++;
      return true;
    });
    // if node is now empty and was an archived catch-all, leave it (it's a valid folder)
  }
  if (Array.isArray(node.children)) {
    node.children.forEach(cleanNode);
  }
}

data.categories.forEach(cleanNode);

console.log(`\n========================================`);
console.log(isTest ? '  Clean Archive Audio — TEST MODE' : '  Clean Archive Audio — FULL MODE');
console.log(`========================================`);
console.log(`  RAM removed:       ${ramRemoved}`);
console.log(`  WMA remaining:     ${wmaCount}  (need download + convert)`);
console.log(`  WAV remaining:     ${wavCount}   (need convert)`);
console.log(`  M4A remaining:     ${m4aCount}   (works natively, no action needed)`);

if (!isTest) {
  fs.writeFileSync(BACKUP, fs.readFileSync(inputPath));
  fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
  console.log(`\n  Saved to:  ${inputPath}`);
  console.log(`  Backup at: ${BACKUP}`);
}
console.log(`========================================\n`);
