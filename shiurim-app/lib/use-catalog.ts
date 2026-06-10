'use client'

import { useEffect, useState } from 'react'
import { loadCatalog, isCatalogReady, getLectureByIdSync } from '@/lib/client-catalog'

/** Loads the client catalog once and exposes synchronous lookups.
 *  Components render their loading state until `ready` flips true. */
export function useCatalog() {
  const [ready, setReady] = useState(isCatalogReady)

  useEffect(() => {
    if (ready) return
    let alive = true
    loadCatalog()
      .then(() => { if (alive) setReady(true) })
      .catch(() => {})
    return () => { alive = false }
  }, [ready])

  return { ready, getLectureById: getLectureByIdSync }
}
