// Placement helper for merging Supabase pending_lectures into the category tree at build
// time (scripts/generate-node-data.mjs). Split out so it can be unit-tested in isolation.
//
// Walks a node_path of ANY depth (the Zoom pipeline emits 2-level [category, sub]; the
// Drive pipeline can emit a deeper pin like [kisvei-rishonim, ...rambam, ...perek-chelek]).
// The FINAL segment is created on the fly when it's missing AND a nodeLabel is supplied —
// that's the Drive "per-rabbi fallback" folder (e.g. a "Rabbi Bald" node under Gemarah).
// Missing intermediate segments are never invented; placement stops at the deepest node
// that actually resolved (so a bad path degrades to its nearest ancestor rather than
// dropping the shiur).

export function resolvePlacement(categories, nodePath, nodeLabel) {
  if (!Array.isArray(nodePath) || nodePath.length === 0) return null
  let level = categories
  let node = null

  for (let i = 0; i < nodePath.length; i++) {
    const id = nodePath[i]
    const isLast = i === nodePath.length - 1
    let next = (level ?? []).find(n => n.id === id)

    if (!next) {
      if (isLast && nodeLabel) {
        next = { id, label: nodeLabel, lectures: [] }
        ;(level ?? (node.children = [])).push(next)
      } else {
        break // missing intermediate, or missing leaf without a label → stop at ancestor
      }
    }

    node = next
    level = next.children // undefined once we reach a leaf
    if (!level && !isLast) break // path continues past a leaf → place at the leaf
  }

  return node
}
