const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, '..', 'data', 'lectures.json');
const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// Print top-level type and keys
console.log('Top-level type:', Array.isArray(data) ? 'array' : typeof data);
if (Array.isArray(data)) {
  console.log('Length:', data.length);
  console.log('First item keys:', Object.keys(data[0] || {}));
  console.log('First item sample:', JSON.stringify(data[0]).slice(0, 300));
} else {
  console.log('Keys:', Object.keys(data));
  console.log('Sample:', JSON.stringify(data).slice(0, 300));
}
