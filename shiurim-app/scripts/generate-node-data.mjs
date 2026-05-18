import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const data = JSON.parse(readFileSync(join(__dirname, '../data/lectures.json'), 'utf8'))
const outDir = join(__dirname, '../public/lectures-data')
mkdirSync(outDir, { recursive: true })

function flattenCount(node) {
  let count = node.lectures?.length ?? 0
  if (node.children) {
    for (const child of node.children) count += flattenCount(child)
  }
  return count
}

function processNode(node, breadcrumb) {
  const crumb = [...breadcrumb, { id: node.id, label: node.label }]
  const file = {
    id: node.id,
    label: node.label,
    totalCount: flattenCount(node),
    breadcrumb: crumb,
    children: node.children?.map(c => ({
      id: c.id,
      label: c.label,
      count: flattenCount(c),
      sectionCount: c.children?.length ?? 0,
      isLeaf: !!c.lectures,
    })) ?? null,
    lectures: node.lectures ?? null,
  }
  writeFileSync(join(outDir, `${node.id}.json`), JSON.stringify(file))
  if (node.children) {
    for (const child of node.children) processNode(child, crumb)
  }
}

for (const cat of data.categories) {
  processNode(cat, [])
}

writeFileSync(
  join(outDir, 'index.json'),
  JSON.stringify({
    categories: data.categories.map(cat => ({
      id: cat.id,
      label: cat.label,
      icon: cat.icon ?? null,
      count: flattenCount(cat),
    })),
  })
)

console.log(`[generate-node-data] wrote ${outDir}`)
