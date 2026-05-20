// Script to move nach-ruth -> nach-megillot-rut and nach-koheles -> nach-megillot-kohelet
const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '../data/lectures.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

function findNode(node, id) {
  if (node.id === id) return node;
  if (node.children) {
    for (const child of node.children) {
      const found = findNode(child, id);
      if (found) return found;
    }
  }
  return null;
}

function removeChildById(node, id) {
  if (node.children) {
    const idx = node.children.findIndex(c => c.id === id);
    if (idx !== -1) {
      node.children.splice(idx, 1);
      return true;
    }
    for (const child of node.children) {
      if (removeChildById(child, id)) return true;
    }
  }
  return false;
}

// Search across top-level categories array
const root = { children: data.categories };

const ruthNode        = findNode(root, 'nach-ruth');
const kohelesNode     = findNode(root, 'nach-koheles');
const megillotRutNode = findNode(root, 'nach-megillot-rut');
const megillotKoheletNode = findNode(root, 'nach-megillot-kohelet');

console.log('nach-ruth found:',             !!ruthNode,        ruthNode        ? `(${(ruthNode.lectures||[]).length} lectures)`    : '');
console.log('nach-koheles found:',          !!kohelesNode,     kohelesNode     ? `(${(kohelesNode.lectures||[]).length} lectures)`  : '');
console.log('nach-megillot-rut found:',     !!megillotRutNode, megillotRutNode ? `(${(megillotRutNode.lectures||[]).length} existing lectures)` : '');
console.log('nach-megillot-kohelet found:', !!megillotKoheletNode, megillotKoheletNode ? `(${(megillotKoheletNode.lectures||[]).length} existing lectures)` : '');

if (!ruthNode || !kohelesNode || !megillotRutNode || !megillotKoheletNode) {
  console.error('One or more nodes not found. Aborting.');
  process.exit(1);
}

// Move lectures from nach-ruth -> nach-megillot-rut
const ruthLectures = ruthNode.lectures || [];
if (!megillotRutNode.lectures) megillotRutNode.lectures = [];
megillotRutNode.lectures.push(...ruthLectures);
console.log(`\nMoved ${ruthLectures.length} lectures to nach-megillot-rut`);

// Move lectures from nach-koheles -> nach-megillot-kohelet
const kohelesLectures = kohelesNode.lectures || [];
if (!megillotKoheletNode.lectures) megillotKoheletNode.lectures = [];
megillotKoheletNode.lectures.push(...kohelesLectures);
console.log(`Moved ${kohelesLectures.length} lectures to nach-megillot-kohelet`);

// Remove the now-empty source nodes
removeChildById(root, 'nach-ruth');
removeChildById(root, 'nach-koheles');
console.log('Removed nach-ruth and nach-koheles nodes');

// Write back
fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf8');
console.log('\nDone! lectures.json updated.');
