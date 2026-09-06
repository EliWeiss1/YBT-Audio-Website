'use client'

import { useRouter } from 'next/navigation'
import { useScope, type Scope } from '@/lib/scope-context'

const TABS: { scope: Scope; label: string; short: string; href: string }[] = [
  { scope: 'ttl',     label: 'TTL',                   short: 'TTL',        href: '/ttl' },
  { scope: 'yeshiva', label: 'Shiurim in Yeshiva',    short: 'In Yeshiva', href: '/' },
  { scope: 'all',     label: 'All Community Shiurim', short: 'All',        href: '/' },
]

/** The three library tabs pinned to the top bar. Rendered twice by LayoutShell:
 *  inline in the header row on desktop, and as a compact second row on mobile.
 *  A click both records the preference and navigates, so the tab always shows
 *  the visitor something rather than silently changing a setting. */
export default function ScopeTabs({ compact = false }: { compact?: boolean }) {
  const { scope, setScope } = useScope()
  const router = useRouter()

  function handleClick(tab: (typeof TABS)[number]) {
    setScope(tab.scope)
    router.push(tab.href)
  }

  return (
    <div
      role="tablist"
      aria-label="Shiurim library"
      className={`flex items-center gap-1 rounded-lg bg-stone-100 p-0.5 shrink-0
        ${compact ? 'w-full' : ''}`}
    >
      {TABS.map(tab => {
        const active = scope === tab.scope
        return (
          <button
            key={tab.scope}
            role="tab"
            aria-selected={active}
            onClick={() => handleClick(tab)}
            className={`rounded-md font-medium whitespace-nowrap transition-colors
              ${compact ? 'flex-1 px-2 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'}
              ${active
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 hover:bg-white'}`}
          >
            {compact ? tab.short : tab.label}
          </button>
        )
      })}
    </div>
  )
}
