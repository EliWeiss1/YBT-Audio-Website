'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useScope, type Scope } from '@/lib/scope-context'

/** TTL is a plain link to its own page — it carries no persisted scope state,
 *  see lib/scope-context.tsx. The other two set the homepage's "Recently
 *  Given" preference and link to the homepage. */
const TABS: { key: 'ttl' | Scope; label: string; short: string; href: string }[] = [
  { key: 'ttl',     label: 'TTL',                   short: 'TTL',        href: '/ttl' },
  { key: 'yeshiva', label: 'Shiurim in Yeshiva',    short: 'In Yeshiva', href: '/' },
  { key: 'all',     label: 'All Community Shiurim', short: 'All',        href: '/' },
]

/** The three library tabs, visible on every page. Rendered twice by
 *  LayoutShell: inline in the header row on desktop, and as a compact second
 *  row on mobile. */
export default function ScopeTabs({ compact = false }: { compact?: boolean }) {
  const { scope, setScope } = useScope()
  const pathname = usePathname()

  return (
    <div
      role="tablist"
      aria-label="Shiurim library"
      className={`flex items-center gap-1 rounded-lg bg-stone-100 p-0.5 shrink-0
        ${compact ? 'w-full' : ''}`}
    >
      {TABS.map(tab => {
        // TTL is active exactly on /ttl. Yeshiva/All reflect the homepage
        // preference, but only actually mean anything ON the homepage — on
        // any other page (e.g. /ttl) neither should light up alongside TTL.
        const active = tab.key === 'ttl'
          ? pathname === '/ttl'
          : pathname === '/' && scope === tab.key
        return (
          <Link
            key={tab.key}
            href={tab.href}
            role="tab"
            aria-selected={active}
            onClick={() => { if (tab.key !== 'ttl') setScope(tab.key) }}
            className={`rounded-md font-medium whitespace-nowrap transition-colors text-center
              ${compact ? 'flex-1 px-2 py-1.5 text-xs' : 'px-3 py-1.5 text-xs'}
              ${active
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 hover:bg-white'}`}
          >
            {compact ? tab.short : tab.label}
          </Link>
        )
      })}
    </div>
  )
}
