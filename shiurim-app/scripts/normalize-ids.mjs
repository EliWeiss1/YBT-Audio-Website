import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataPath = join(__dirname, '..', 'data', 'lectures.json');

function normalizeId(id) {
  return id.replace(/^([A-Z]{1,2})-0*(\d+)$/, (_, prefix, digits) => `${prefix}-${digits}`);
}

function isNormalizableId(id) {
  return /^[A-Z]{1,2}-\d+$/.test(id);
}

let changes = 0;

function processNode(node) {
  if (node.id && isNormalizableId(node.id)) {
    const normalized = normalizeId(node.id);
    if (normalized !== node.id) {
      console.log(`  ID: ${node.id} -> ${normalized}`);
      node.id = normalized;
      changes++;
    }
  }

  if (node.title) {
    const newTitle = node.title.replace(/\(([A-Z]{1,2})-0*(\d+)\)$/, (_, prefix, digits) => `(${prefix}-${digits})`);
    if (newTitle !== node.title) {
      console.log(`  Title: "${node.title}" -> "${newTitle}"`);
      node.title = newTitle;
      changes++;
    }
  }

  if (Array.isArray(node.children)) node.children.forEach(processNode);
  if (Array.isArray(node.lectures)) node.lectures.forEach(processNode);
}

const data = JSON.parse(readFileSync(dataPath, 'utf8'));

// Root has a "categories" array, not children/lectures
if (Array.isArray(data.categories)) {
  data.categories.forEach(processNode);
} else {
  processNode(data);
}

writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log(`\nDone. ${changes} values updated.`);
