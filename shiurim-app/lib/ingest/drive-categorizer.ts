import Anthropic from '@anthropic-ai/sdk'
import folderHierarchy from '@/data/folder-hierarchy.json'

// Categorization for the Google Drive ingest (scripts/drive-sync.mjs). Unlike the Zoom
// email pipeline (categorizer.ts, which searches the whole tree by title), each Drive
// root folder declares a `category` pin (data/drive-folders.json):
//
//   - pin is a SPECIFIC node (e.g. kisvei-rishonim-rambam-perek-chelek) → every shiur in
//     that folder goes straight there.
//   - pin is a TOP-LEVEL category (e.g. gemarah) → sub-categorize by title within it:
//     keyword match on a sub-topic label → constrained AI → else a per-rabbi fallback
//     folder created under the category (e.g. "Rabbi Bald" under Gemarah).

type HNode = { id: string; label: string; children?: HNode[] }
const CATS = (folderHierarchy as { categories: HNode[] }).categories

export type DrivePlacement = {
  nodePath: string[]
  nodeLabel?: string // set only when the leaf must be created (per-rabbi fallback)
  confidence: 'high' | 'low'
  tier: 1 | 2 | 'pinned' | 'alias' | 'rabbi-fallback'
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

// Ancestor chain (nodes) down to `id`, or null if not in the hierarchy.
export function pathToNode(id: string, nodes: HNode[] = CATS, trail: HNode[] = []): HNode[] | null {
  for (const n of nodes) {
    const t = [...trail, n]
    if (n.id === id) return t
    if (n.children) { const r = pathToNode(id, n.children, t); if (r) return r }
  }
  return null
}

// A pin either resolves to a specific node (place directly) or a top-level category (sub-categorize).
export function pinPlacement(pinId: string): { direct?: string[]; category?: HNode } {
  const path = pathToNode(pinId)
  if (!path) return {}
  if (path.length > 1) return { direct: path.map(n => n.id) }
  return { category: path[0] }
}

// First sub-topic whose label appears as a whole word in the title (longest label first,
// so "Bava Batra" beats "Bava"). Returns the child id or null.
export function keywordChild(title: string, category: HNode): string | null {
  const lower = title.toLowerCase()
  const kids = [...(category.children ?? [])].sort((a, b) => b.label.length - a.label.length)
  for (const ch of kids) {
    const label = ch.label.toLowerCase()
    if (label.length < 3) continue
    const re = new RegExp(`\\b${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
    if (re.test(lower)) return ch.id
  }
  return null
}

// A folder can map title keywords straight to a node (e.g. "yomtov" → gemarah-beitza),
// since "Yom Tov" is learned in maseches Beitza but the word "Beitza" never appears in the
// title. Returns the target node id for the first alias key found in the title, or null.
export function aliasMatch(title: string, aliases: Record<string, string> = {}): string | null {
  const lower = title.toLowerCase()
  for (const [kw, nodeId] of Object.entries(aliases)) {
    if (kw && lower.includes(kw.toLowerCase())) return nodeId
  }
  return null
}

// Per-rabbi fallback: a leaf named after the rabbi, created under the category on merge.
export function rabbiFallback(categoryId: string, rabbi: string): DrivePlacement {
  const name = (rabbi || 'Unknown').trim()
  return { nodePath: [categoryId, `${categoryId}-${slug(name)}`], nodeLabel: name, confidence: 'low', tier: 'rabbi-fallback' }
}

export async function categorizeDrive(
  title: string,
  pinId: string,
  rabbi: string,
  aliases: Record<string, string> = {},
): Promise<DrivePlacement> {
  const pin = pinPlacement(pinId)
  if (pin.direct) return { nodePath: pin.direct, confidence: 'high', tier: 'pinned' }
  if (!pin.category) throw new Error(`drive category pin "${pinId}" not found in hierarchy`)

  // Folder-configured title aliases win (e.g. "yomtov" → gemarah-beitza).
  const aliasId = aliasMatch(title, aliases)
  if (aliasId) {
    const p = pathToNode(aliasId)
    if (p) return { nodePath: p.map(n => n.id), confidence: 'high', tier: 'alias' }
  }

  const category = pin.category
  const kw = keywordChild(title, category)
  if (kw) return { nodePath: [category.id, kw], confidence: 'high', tier: 1 }

  const pick = await pickChildWithHaiku(title, category)
  if (pick) return { nodePath: [category.id, pick], confidence: 'high', tier: 2 }

  return rabbiFallback(category.id, rabbi)
}

async function pickChildWithHaiku(title: string, category: HNode): Promise<string | null> {
  const children = (category.children ?? []).map(c => ({ id: c.id, label: c.label }))
  if (!children.length) return null

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const prompt = `A shiur titled "${title}" belongs in the "${category.label}" category. Pick the single best sub-topic, or "none" if nothing clearly fits.

Sub-topics (id — label):
${children.map(c => `${c.id} — ${c.label}`).join('\n')}

Respond with ONLY valid JSON: {"child_id": "<id or 'none'>", "confidence": "high" | "low"}`

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 64,
    messages: [{ role: 'user', content: prompt }],
  })
  const raw = message.content.find(b => b.type === 'text')?.text ?? '{}'
  const m = raw.match(/\{[\s\S]*\}/)
  let parsed: { child_id?: string; confidence?: string }
  try { parsed = JSON.parse(m ? m[0] : raw) } catch { return null }

  // Only accept a confident pick that is a real child id.
  if (!parsed.child_id || parsed.child_id === 'none' || parsed.confidence !== 'high') return null
  return children.some(c => c.id === parsed.child_id) ? parsed.child_id! : null
}
