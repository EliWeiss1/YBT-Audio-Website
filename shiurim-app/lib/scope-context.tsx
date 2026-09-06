'use client'

// Site-wide "which library am I looking at" selector, surfaced as the three
// tabs in the top bar (components/layout/ScopeTabs.tsx).
//
//   'ttl'     — the hand-numbered TTL back-catalogue (D-/C-/N-/HL-/BN- ids),
//               browsed on its own /ttl page.
//   'yeshiva' — shiurim recorded in yeshiva, i.e. the INGEST- ids written by
//               the live email/Zoom pipeline (lib/ingest/types.ts).
//   'all'     — everything, the site's original behaviour.
//
// The scope deliberately only governs the homepage's "Recently Given" list and
// which page a tab click routes to. Search, the sidebar tree, /lectures node
// pages and /rabbi/[name] all stay unscoped.

import { createContext, useContext, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

export type Scope = 'ttl' | 'yeshiva' | 'all'

const STORAGE_KEY = 'ybt:scope'

/** What a first-time visitor sees. Also the value rendered on the server and on
 *  the first client render, so hydration always matches; a returning visitor's
 *  stored preference is applied in an effect immediately afterwards.
 *
 *  We deliberately don't gate rendering on "has localStorage been read yet" —
 *  that would replace the homepage's server-rendered list with a skeleton for
 *  everyone on every load. Rendering the default and letting the one effect
 *  swap the tab highlight and the list together (React batches them into a
 *  single commit) costs at most one repaint, and only for visitors who picked
 *  something other than the default. */
export const DEFAULT_SCOPE: Scope = 'yeshiva'

function isScope(v: unknown): v is Scope {
  return v === 'ttl' || v === 'yeshiva' || v === 'all'
}

type ScopeContextValue = {
  scope: Scope
  setScope: (s: Scope) => void
}

const ScopeContext = createContext<ScopeContextValue>({
  scope: DEFAULT_SCOPE,
  setScope: () => {},
})

export function ScopeProvider({ children }: { children: React.ReactNode }) {
  const [scope, setScopeState] = useState<Scope>(DEFAULT_SCOPE)
  const pathname = usePathname()

  function persist(next: Scope) {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference just won't persist; the tab still switches for this session.
    }
  }

  // Plain (passive) effect on purpose: LayoutShell documents an effect-ordering
  // dependency in this subtree, so nothing here may run at layout time.
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isScope(stored)) setScopeState(stored)
    } catch {
      // Safari private mode / storage disabled — fall back to the default.
    }
  }, [])

  // /ttl is the TTL tab's own page, so arriving there by any route — a shared
  // link, a refresh, the back button — means the visitor is in the TTL library.
  // Without this the tab strip would keep highlighting whatever was stored,
  // which reads as a broken selection. Runs after the restore effect above, so
  // it wins on a direct load of /ttl.
  useEffect(() => {
    if (pathname === '/ttl') {
      setScopeState(prev => (prev === 'ttl' ? prev : 'ttl'))
      persist('ttl')
    }
  }, [pathname])

  function setScope(next: Scope) {
    setScopeState(next)
    persist(next)
  }

  return (
    <ScopeContext.Provider value={{ scope, setScope }}>
      {children}
    </ScopeContext.Provider>
  )
}

export function useScope(): ScopeContextValue {
  return useContext(ScopeContext)
}
