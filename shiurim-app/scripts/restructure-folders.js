/**
 * restructure-folders.js
 * 1. Moves `logic` folder (with its children) into `discussion`
 * 2. Moves `shulchan-aruch` folder (with its children) into `halacha`
 * Removes the nodes from their current parent in the process.
 */

const fs   = require('fs');
const path = require('path');

const inputPath = path.join('data', 'lectures.json');
const BACKUP    = inputPath.replace('.json', '.backup-restructure.json');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const { categories } = data;

// ─── helpers ──────────────────────────────────────────────────────────────────
function findNode(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) { const f = findNode(n.children, id); if (f) return f; }
  }
  return null;
}

// Remove a node from wherever it lives; return it
function extractNode(nodes, id, parent = null) {
  for (let i = 0; i < nodes.length; i++) {
    if (nodes[i].id === id) {
      const [node] = nodes.splice(i, 1);
      return { node, fromParent: parent };
    }
    if (nodes[i].children) {
      const result = extractNode(nodes[i].children, id, nodes[i]);
      if (result) return result;
    }
  }
  return null;
}

// ─── 1. Move `logic` → `discussion` ──────────────────────────────────────────
const logicResult = extractNode(categories, 'logic');
if (!logicResult) { console.error('ERROR: logic node not found'); process.exit(1); }
const discussion = findNode(categories, 'discussion');
if (!discussion) { console.error('ERROR: discussion node not found'); process.exit(1); }
discussion.children.push(logicResult.node);
console.log(`✓ Moved 'logic' from top-level → discussion`);

// ─── 2. Move `shulchan-aruch` → `halacha` ────────────────────────────────────
const shulchanResult = extractNode(categories, 'shulchan-aruch');
if (!shulchanResult) { console.error('ERROR: shulchan-aruch node not found'); process.exit(1); }
const halacha = findNode(categories, 'halacha');
if (!halacha) { console.error('ERROR: halacha node not found'); process.exit(1); }
if (!halacha.children) halacha.children = [];
halacha.children.push(shulchanResult.node);
console.log(`✓ Moved 'shulchan-aruch' (with ${shulchanResult.node.children?.length || 0} subfolders) → halacha`);

// ─── save ─────────────────────────────────────────────────────────────────────
fs.writeFileSync(BACKUP, JSON.stringify(data, null, 2));
fs.writeFileSync(inputPath, JSON.stringify(data, null, 2));
console.log(`\nSaved to ${inputPath}`);
console.log(`Backup at ${BACKUP}`);
