// One-time script: sorts Discussion subfolders alphabetically in lectures.json
const fs = require('fs')
const path = require('path')

const filePath = path.join(__dirname, '..', 'data', 'lectures.json')
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))

const discussion = data.categories.find(c => c.id === 'discussion')
if (!discussion || !discussion.children) {
  console.error('Discussion category not found')
  process.exit(1)
}

discussion.children.sort((a, b) =>
  a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
)

fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
console.log(`Sorted ${discussion.children.length} Discussion subfolders alphabetically.`)
console.log('First 5:', discussion.children.slice(0, 5).map(c => c.label).join(', '))
