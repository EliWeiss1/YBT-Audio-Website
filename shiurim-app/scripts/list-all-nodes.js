const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'lectures.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const root = Array.isArray(data) ? data : [data];

function print(nodes, depth = 0) {
  for (const node of nodes) {
    if (node.id || node.title) {
      console.log(' '.repeat(depth * 2) + `id="${node.id}" | title="${node.title}"`);
    }
    if (node.children) print(node.children, depth + 1);
  }
}

print(root);
