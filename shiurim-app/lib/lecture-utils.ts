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
  pdfUrl?: string
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

/** True if `url` is served from our R2 bucket — the only audio currently safe to
 *  proxy-download through /api/download without burning Vercel's Fast Origin
 *  Transfer quota. Other hosts (yutorah.org, ybt.org) proxy the full file through
 *  a serverless function on every download, so their download UI is disabled
 *  until they're migrated to R2. */
export function isR2Hosted(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('.r2.dev')
  } catch {
    return false
  }
}

/**
 * Build a human-readable slug from a shiur title. Everything that isn't
 * [a-z0-9] collapses to a single hyphen, so a slug can never contain "--"
 * — which is what lets `{slug}--{id}` be split back apart unambiguously.
 */
export function slugifyTitle(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '')
}

/**
 * Canonical share path for a shiur: `/lectures/{title-slug}--{id}`.
 * Titles aren't unique (~1/3 collide), so the id is kept as a suffix for
 * resolution, separated by "--" (which a slug never contains). Falls back to
 * the bare `/lectures/{id}` form when a title produces an empty slug.
 */
export function lectureSharePath(id: string, title: string): string {
  const slug = slugifyTitle(title)
  const encodedId = encodeURIComponent(id)
  return slug ? `/lectures/${slug}--${encodedId}` : `/lectures/${encodedId}`
}

/**
 * Pull the shiur id back out of a `[id]` route param, which may be either a
 * bare id (older links) or the `{slug}--{id}` share form. Expects the already
 * URL-decoded param and returns the id after the last "--" separator.
 */
export function lectureIdFromParam(decodedParam: string): string {
  const sep = decodedParam.lastIndexOf('--')
  return sep === -1 ? decodedParam : decodedParam.slice(sep + 2)
}

/**
 * Parse a lecture's `date` field ("YYYY-MM-DD") as a local calendar date.
 * `new Date("YYYY-MM-DD")` parses as UTC midnight, which formats as the
 * previous day in any timezone behind UTC — this constructs the Date from
 * the local components instead so the calendar date never shifts.
 */
export function parseLectureDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(year, month - 1, day)
}

/** Format seconds as h:mm:ss or m:ss */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
