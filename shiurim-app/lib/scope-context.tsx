'use client'

// Homepage-only "which recently-given list am I looking at" preference,
// surfaced as two of the three tabs in components/layout/ScopeTabs.tsx (the
// third, TTL, is just a link to its own page — see below).
//
//   'yeshiva' — shiurim recorded in yeshiva, i.e. the INGEST- ids written by
//               the live email/Zoom pipeline (lib/ingest/types.ts).
//   'all'     — everything, the site's original behaviour.
//
// This deliberately isn't a site-wide "library" concept. TTL browsing lives
// entirely at its own URL (/ttl) with no persisted state of its own — which
// tab is highlighted there is derived straight from the pathname, not stored.
// Earlier this type included a third 'ttl' member that got persisted to
// localStorage on every /ttl visit, which then wrongly won the tab highlight
// back on the homepage (nothing on '/' could ever legitimately be 'ttl').
// Keeping the persisted state's domain limited to the two homepage lists is
// what makes that class of bug impossible now.
//
// Only used on the homepage — the tab bar itself only renders there too (see
// LayoutShell), so search, the sidebar tree, /lectures node pages and
// /rabbi/[name] all stay unaffected regardless.

import { createContext, useContext, useEffect, useState } from 'react'

export type Scope = 'yeshiva' | 'all'

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
  return v === 'yeshiva' || v === 'all'
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

  function setScope(next: Scope) {
    setScopeState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Preference just won't persist; the tab still switches for this session.
    }
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
