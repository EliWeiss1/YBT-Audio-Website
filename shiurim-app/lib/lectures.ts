import lecturesData from '@/data/lectures.json'

// ─── Types ────────────────────────────────────────────────────────────────────

export type Lecture = {
  id: string
  title: string
  audioUrl: string
  duration: number
  description: string
  speaker: string
  date: string
  tags: string[]
}

// A TreeNode is either:
//   - a leaf:   has `lectures`, no `children`
//   - a branch: has `children`, no `lectures`
export type TreeNode = {
  id: string
  label: string
  icon?: string          // only on top-level category nodes
  children?: TreeNode[]
  lectures?: Lecture[]
}

export const categories: TreeNode[] = lecturesData.categories as TreeNode[]

// ─── Recursive helpers ────────────────────────────────────────────────────────

/** Flatten every lecture in a subtree into a single array, with breadcrumb info. */
export type FlatLecture = Lecture & {
  breadcrumb: string[]    // e.g. ["Chumash", "Bereishit", "Noach"]
  nodeId: string          // id of the leaf TreeNode that owns this lecture
}

export function flattenLectures(
  node: TreeNode,
  breadcrumb: string[] = []
): FlatLecture[] {
  const crumb = [...breadcrumb, node.label]
  const results: FlatLecture[] = []
  if (node.lectures) {
    results.push(...node.lectures.map(lec => ({ ...lec, breadcrumb: crumb, nodeId: node.id })))
  }
  if (node.children) {
    results.push(...node.children.flatMap(child => flattenLectures(child, crumb)))
  }
  return results
}

/** All lectures across every category, flattened. Used for search. */
let _allLectures: FlatLecture[] | null = null
export function getAllLectures(): FlatLecture[] {
  if (_allLectures) return _allLectures
  const seen = new Set<string>()
  _allLectures = categories
    .flatMap(cat => flattenLectures(cat))
    .filter(l => {
      if (seen.has(l.id)) return false
      seen.add(l.id)
      return true
    })
  return _allLectures
}

/** Find a single lecture by id anywhere in the tree. */
export function getLectureById(id: string): FlatLecture | null {
  return getAllLectures().find(l => l.id === id) ?? null
}

/** Find the TreeNode at a given path of ids, e.g. ["chumash","bereishit","noach"] */
export function getNodeByPath(path: string[]): TreeNode | null {
  if (!path.length) return null
  let node: TreeNode | undefined = categories.find(c => c.id === path[0])
  for (let i = 1; i < path.length; i++) {
    node = node?.children?.find(c => c.id === path[i])
  }
  return node ?? null
}

/** Get the path of ids from root to a given node id (breadth-first search). */
export function getPathToNode(targetId: string): string[] | null {
  function search(node: TreeNode, path: string[]): string[] | null {
    const current = [...path, node.id]
    if (node.id === targetId) return current
    for (const child of node.children ?? []) {
      const result = search(child, current)
      if (result) return result
    }
    return null
  }
  for (const cat of categories) {
    const result = search(cat, [])
    if (result) return result
  }
  return null
}

/** Get prev/next lecture in flattened order. */
export function getAdjacentLectures(lectureId: string) {
  const all = getAllLectures()
  const idx = all.findIndex(l => l.id === lectureId)
  return {
    prev: idx > 0 ? all[idx - 1] : null,
    next: idx < all.length - 1 ? all[idx + 1] : null,
  }
}

/** Format seconds as h:mm:ss or m:ss */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}