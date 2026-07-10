import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { resolvePlacement } from './lib/merge-pending.mjs'
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../public/lectures-data')

async function mergePendingLectures(lecturesData) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceKey) {
    console.log('[generate] No Supabase credentials — skipping pending_lectures merge')
    return lecturesData
  }
  const supabase = createClient(supabaseUrl, serviceKey)
  const { data: pending, error } = await supabase
    .from('pending_lectures')
    .select('*')
    .eq('status', 'active')
  if (error || !pending?.length) return lecturesData

  // Deep-clone categories to avoid mutating the imported object
  const categories = JSON.parse(JSON.stringify(lecturesData.categories))

  for (const shiur of pending) {
    // Walk the node_path at any depth; create the per-rabbi fallback leaf when node_label is set.
    const node = resolvePlacement(categories, shiur.node_path, shiur.node_label)
    if (!node) { console.warn(`[generate] Could not place shiur ${shiur.id} at ${JSON.stringify(shiur.node_path)}`); continue }
    if (!node.lectures) node.lectures = []
    node.lectures.unshift({
      id: shiur.id,
      title: shiur.title,
      speaker: shiur.speaker,
      date: shiur.date,
      description: shiur.description,
      audioUrl: shiur.audio_url,
      duration: shiur.duration,
      tags: shiur.tags ?? [],
    })
  }
  console.log(`[generate] Merged ${pending.length} pending lecture(s) from Supabase`)
  return { ...lecturesData, categories }
}

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

;(async () => {
  const rawData = JSON.parse(readFileSync(join(__dirname, '../data/lectures.json'), 'utf8'))
  const data = await mergePendingLectures(rawData)

  mkdirSync(outDir, { recursive: true })

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

  // ── catalog.json — full flat lecture list for client-side search/lookups ─────
  // Mirrors lib/lectures.ts getAllLectures(): lectures-before-children order,
  // first occurrence wins on duplicate ids. Fetched lazily by lib/client-catalog.ts
  // so the 9.4MB source JSON never ends up in the JS bundle.
  const seenIds = new Set()
  const flatCatalog = []
  function flattenInto(node, breadcrumb) {
    const crumb = [...breadcrumb, node.label]
    if (node.lectures) {
      for (const lec of node.lectures) {
        if (seenIds.has(lec.id)) continue
        seenIds.add(lec.id)
        flatCatalog.push({ ...lec, breadcrumb: crumb, nodeId: node.id })
      }
    }
    if (node.children) {
      for (const child of node.children) flattenInto(child, crumb)
    }
  }
  for (const cat of data.categories) flattenInto(cat, [])
  writeFileSync(join(outDir, 'catalog.json'), JSON.stringify(flatCatalog))

  // ── tree.json — full category tree without lectures, for the sidebar ─────────
  function toTreeNode(node) {
    return {
      id: node.id,
      label: node.label,
      ...(node.icon ? { icon: node.icon } : {}),
      count: flattenCount(node),
      ...(node.children ? { children: node.children.map(toTreeNode) } : {}),
    }
  }
  writeFileSync(
    join(outDir, 'tree.json'),
    JSON.stringify({ categories: data.categories.map(toTreeNode) })
  )

  // ── speakers.json — raw speaker → lecture count (client normalizes names) ────
  const speakerCounts = {}
  for (const lec of flatCatalog) {
    if (lec.speaker) speakerCounts[lec.speaker] = (speakerCounts[lec.speaker] ?? 0) + 1
  }
  writeFileSync(join(outDir, 'speakers.json'), JSON.stringify(speakerCounts))

  console.log(`[generate-node-data] wrote ${outDir} (${flatCatalog.length} lectures in catalog.json)`)
})()
