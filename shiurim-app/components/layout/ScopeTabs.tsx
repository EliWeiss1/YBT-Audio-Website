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

/** The three library tabs. Sit directly above the section they control —
 *  "Recently Given" on the homepage, the TTL section switcher on /ttl — since
 *  Yeshiva/All only mean anything there, and TTL is the third state of the
 *  same choice. Sized to read as the primary switch for that section, not a
 *  bit of chrome. */
export default function ScopeTabs() {
  const { scope, setScope } = useScope()
  const pathname = usePathname()

  return (
    <div
      role="tablist"
      aria-label="Shiurim library"
      className="flex items-center gap-1.5 rounded-2xl border border-stone-200 bg-white p-1.5 shadow-sm mb-6"
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
            className={`flex-1 rounded-xl px-3 py-3 text-center font-semibold whitespace-nowrap
              transition-colors text-xs sm:text-sm
              ${active
                ? 'bg-emerald-700 text-white shadow-sm'
                : 'text-stone-500 hover:text-stone-800 hover:bg-stone-50'}`}
          >
            <span className="sm:hidden">{tab.short}</span>
            <span className="hidden sm:inline">{tab.label}</span>
          </Link>
        )
      })}
    </div>
  )
}
