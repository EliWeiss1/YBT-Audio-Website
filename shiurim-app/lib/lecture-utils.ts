// Pure lecture types + helpers, safe to import from client components.
// IMPORTANT: this module must never import data/lectures.json — client code
// importing from here is how we keep the 9.4MB catalog out of the JS bundle.
// (Server code that needs the full data imports lib/lectures.ts instead.)

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

/** A lecture flattened out of the tree, with breadcrumb info. */
export type FlatLecture = Lecture & {
  breadcrumb: string[]    // e.g. ["Chumash", "Bereishit", "Noach"]
  nodeId: string          // id of the leaf TreeNode that owns this lecture
}

/** Format seconds as h:mm:ss or m:ss */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
