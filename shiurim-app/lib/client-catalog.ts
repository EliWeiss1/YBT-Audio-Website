// Client-side access to the lecture catalog. The data is generated into
// /public/lectures-data/ at build time (scripts/generate-node-data.mjs) and
// fetched lazily here — keeping the 9.4MB lectures.json out of the JS bundle.
// The service worker caches these files, so after the first load they're
// available offline and load instantly.

import type { FlatLecture } from '@/lib/lecture-utils'

// ── Flat catalog (all lectures) ──────────────────────────────────────────────

let catalogPromise: Promise<FlatLecture[]> | null = null
let catalog: FlatLecture[] | null = null
let byId: Map<string, FlatLecture> | null = null

export function loadCatalog(): Promise<FlatLecture[]> {
  if (!catalogPromise) {
    catalogPromise = fetch('/lectures-data/catalog.json')
      .then(res => {
        if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`)
        return res.json() as Promise<FlatLecture[]>
      })
      .then(data => {
        catalog = data
        byId = new Map(data.map(l => [l.id, l]))
        return data
      })
      .catch(err => {
        catalogPromise = null // allow retry on next call
        throw err
      })
  }
  return catalogPromise
}

export function isCatalogReady(): boolean {
  return catalog !== null
}

/** Synchronous lookup — returns null until loadCatalog() has resolved. */
export function getLectureByIdSync(id: string): FlatLecture | null {
  return byId?.get(id) ?? null
}

export async function getLecture(id: string): Promise<FlatLecture | null> {
  await loadCatalog()
  return getLectureByIdSync(id)
}

// ── Category tree (sidebar) — a few KB, no lecture entries ──────────────────

export type CatalogTreeNode = {
  id: string
  label: string
  icon?: string
  count: number
  children?: CatalogTreeNode[]
}

let treePromise: Promise<CatalogTreeNode[]> | null = null

export function loadTree(): Promise<CatalogTreeNode[]> {
  if (!treePromise) {
    treePromise = fetch('/lectures-data/tree.json')
      .then(res => {
        if (!res.ok) throw new Error(`tree fetch failed: ${res.status}`)
        return res.json()
      })
      .then((data: { categories: CatalogTreeNode[] }) => data.categories)
      .catch(err => {
        treePromise = null
        throw err
      })
  }
  return treePromise
}

// ── Speaker counts (raw names — callers normalize via rabbi-normalization) ──

let speakersPromise: Promise<Record<string, number>> | null = null

export function loadSpeakerCounts(): Promise<Record<string, number>> {
  if (!speakersPromise) {
    speakersPromise = fetch('/lectures-data/speakers.json')
      .then(res => {
        if (!res.ok) throw new Error(`speakers fetch failed: ${res.status}`)
        return res.json()
      })
      .catch(err => {
        speakersPromise = null
        throw err
      })
  }
  return speakersPromise
}
