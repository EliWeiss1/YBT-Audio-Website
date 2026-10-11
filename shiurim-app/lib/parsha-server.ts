// SERVER-ONLY: reads the per-node chunk files (public/lectures-data/<id>.json)
// rather than the 9.4MB lectures.json. Chunks include pending Supabase rows and
// keep a cross-listed shiur under every node it's filed in, which the flat
// catalog (deduped by id) would collapse into one.

import { readFileSync } from 'fs'
import { join } from 'path'
import type { FlatLecture, Lecture } from '@/lib/lecture-utils'
import type { ParshaRef } from '@/lib/parsha'

type NodeChunk = {
  breadcrumb: { id: string; label: string }[]
  lectures: Lecture[] | null
}

/** Every shiur filed under one parsha, newest first (undated last). */
export function getParshaLectures(parsha: ParshaRef): FlatLecture[] {
  let chunk: NodeChunk
  try {
    chunk = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'lectures-data', `${parsha.nodeId}.json`), 'utf8'),
    )
  } catch {
    return []
  }
  const breadcrumb = chunk.breadcrumb.map(b => b.label)
  return (chunk.lectures ?? [])
    .map(l => ({ ...l, breadcrumb, nodeId: parsha.nodeId }))
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
}
