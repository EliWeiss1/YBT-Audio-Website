const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'lectures.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const root = data.categories;

function findByLabel(nodes, label) {
  for (const node of nodes) {
    if ((node.label || '').toLowerCase() === label.toLowerCase()) return node;
    if (node.children) {
      const r = findByLabel(node.children, label);
      if (r) return r;
    }
  }
  return null;
}

function removeByLabel(nodes, label) {
  const idx = nodes.findIndex(n => (n.label || '').toLowerCase() === label.toLowerCase());
  if (idx !== -1) { nodes.splice(idx, 1); return true; }
  for (const node of nodes) {
    if (node.children && removeByLabel(node.children, label)) return true;
  }
  return false;
}

const source = findByLabel(root, 'Ahavat Hashem');
const dest   = findByLabel(root, 'Ahavat/Yirat Hashem');

if (!source) { console.error('Could not find "Ahavat Hashem" node'); process.exit(1); }
if (!dest)   { console.error('Could not find "Ahavat/Yirat Hashem" node'); process.exit(1); }

console.log(`Source: id="${source.id}" label="${source.label}" lectures=${source.lectures?.length ?? 0} children=${source.children?.length ?? 0}`);
console.log(`Dest:   id="${dest.id}"   label="${dest.label}"   lectures=${dest.lectures?.length ?? 0} children=${dest.children?.length ?? 0}`);

// Move lectures (or children) from source into dest
const toMove = source.lectures || source.children || [];
if (source.lectures) {
  if (!dest.lectures) dest.lectures = [];
  dest.lectures.push(...toMove);
} else if (source.children) {
  if (!dest.children) dest.children = [];
  dest.children.push(...toMove);
}

console.log(`Moved ${toMove.length} item(s) into "${dest.label}"`);

// Delete source node
removeByLabel(root, 'Ahavat Hashem');
console.log(`Deleted "${source.label}" node`);

fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log('lectures.json saved.');
