'use client'

import { useState, useMemo, useRef, useCallback } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import Fuse from 'fuse.js'
import { categories, getAllLectures, TreeNode } from '@/lib/lectures'
import { normalizeRabbi, getRawVariants } from '@/lib/rabbi-normalization'

// ─── Recursive tree node ──────────────────────────────────────────────────────

function TreeItem({
  node,
  depth = 0,
  activePath,
  rabbiParam,
}: {
  node: TreeNode
  depth?: number
  activePath: string[]
  rabbiParam: string
}) {
  const isInActivePath = activePath.includes(node.id)
  const [open, setOpen] = useState(isInActivePath)
  const isLeaf = !node.children || node.children.length === 0
  const lectureCount = node.lectures?.length

  if (isLeaf) {
    const href = rabbiParam
      ? `/lectures?node=${node.id}&rabbi=${rabbiParam}`
      : `/lectures?node=${node.id}`
    const isActive = activePath[activePath.length - 1] === node.id
    return (
      <Link
        href={href}
        className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm transition-colors mb-0.5
          ${isActive
            ? 'bg-emerald-50 text-emerald-800 font-medium'
            : 'text-stone-600 hover:bg-stone-50'}`}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        <span className="truncate">{node.label}</span>
        {lectureCount !== undefined && (
          <span className="text-xs text-stone-300 ml-2 shrink-0">{lectureCount}</span>
        )}
      </Link>
    )
  }

  return (
    <div>
      <button
        onClick={() => setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-1.5 text-sm transition-colors rounded-lg
          ${depth === 0
            ? 'font-semibold text-stone-700 hover:bg-stone-50'
            : 'text-stone-600 hover:bg-stone-50'}`}
        style={{ paddingLeft: `${12 + depth * 12}px` }}
      >
        <span className="flex items-center gap-1.5 truncate">
          {depth === 0 && node.icon && <span>{node.icon}</span>}
          {node.label}
        </span>
        <span className={`text-stone-400 text-xs transition-transform duration-150 shrink-0 ml-1
          ${open ? 'rotate-90' : ''}`}>›</span>
      </button>

      {open && (
        <div className={depth === 0 ? 'ml-2 border-l border-stone-100 pl-1' : ''}>
          {node.children?.map(child => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              activePath={activePath}
              rabbiParam={rabbiParam}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const router = useRouter()
  const activeNodeId = searchParams.get('node') ?? ''
  const [query, setQuery] = useState('')
  const [sidebarWidth, setSidebarWidth] = useState(280)
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [rabbiSectionOpen, setRabbiSectionOpen] = useState(false)
  const isResizing = useRef(false)

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newWidth = Math.min(520, Math.max(220, startWidth + ev.clientX - startX))
      setSidebarWidth(newWidth)
    }
    const onUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }, [sidebarWidth])

  const activePath = useMemo(() => {
    if (!activeNodeId) return []
    function findPath(node: TreeNode, target: string, path: string[]): string[] | null {
      const current = [...path, node.id]
      if (node.id === target) return current
      for (const child of node.children ?? []) {
        const result = findPath(child, target, current)
        if (result) return result
      }
      return null
    }
    for (const cat of categories) {
      const result = findPath(cat, activeNodeId, [])
      if (result) return result
    }
    return []
  }, [activeNodeId])

  const allLectures = useMemo(() => getAllLectures(), [])

  // Canonical speaker names sorted by total lecture count descending
  const speakerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of allLectures) {
      if (l.speaker) {
        const canonical = normalizeRabbi(l.speaker)
        counts[canonical] = (counts[canonical] ?? 0) + 1
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [allLectures])

  // rabbiParam carries canonical names — lecture page normalizes for filtering
  const rabbiParam = selectedRabbis.length > 0
    ? selectedRabbis.map(encodeURIComponent).join(',')
    : ''

  function toggleRabbi(canonical: string) {
    const next = selectedRabbis.includes(canonical)
      ? selectedRabbis.filter(r => r !== canonical)
      : [...selectedRabbis, canonical]
    setSelectedRabbis(next)

    // If currently viewing a node page, push updated URL immediately
    if (activeNodeId) {
      const newParam = next.map(encodeURIComponent).join(',')
      const newHref = newParam
        ? `/lectures?node=${activeNodeId}&rabbi=${newParam}`
        : `/lectures?node=${activeNodeId}`
      router.push(newHref)
    }
  }

  function clearRabbis() {
    setSelectedRabbis([])
    if (activeNodeId) {
      router.push(`/lectures?node=${activeNodeId}`)
    }
  }

  // Fuse runs on the rabbi-filtered pool (expanded to raw variants)
  const searchPool = useMemo(() => {
    if (selectedRabbis.length === 0) return allLectures
    const rawVariants = new Set(selectedRabbis.flatMap(getRawVariants))
    return allLectures.filter(l => rawVariants.has(l.speaker))
  }, [allLectures, selectedRabbis])

  const fuse = useMemo(() => new Fuse(searchPool, {
    keys: ['title', 'description', 'speaker', 'tags', 'breadcrumb'],
    threshold: 0.3,
  }), [searchPool])
  const searchResults = query.length > 1 ? fuse.search(query).slice(0, 14) : []

  return (
    <aside
      className="shrink-0 bg-white border-r border-stone-200 flex flex-col h-screen overflow-hidden relative"
      style={{ width: sidebarWidth }}
    >
      {/* Logo + mobile close */}
      <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <Image src="/YBT_Logo.gif" alt="YBT Logo" width={40} height={40} className="rounded" unoptimized />
          <div>
            <div className="font-bold text-stone-900 leading-tight">YBT Shiurim</div>
          </div>
        </Link>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-600 transition-colors md:hidden"
            aria-label="Close menu"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Search */}
      <div className="px-4 py-3 border-b border-stone-200">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search shiurim..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg
                       focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          {query && (
            <button
              onClick={() => setQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs"
            >✕</button>
          )}
        </div>
      </div>

      {/* Feed link */}
      <div className="px-4 py-2 border-b border-stone-100">
        <Link href="/feed"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${pathname === '/feed' ? 'bg-emerald-50 text-emerald-800' : 'text-stone-600 hover:bg-stone-50'}`}>
          <span>🗣️</span> Discussion Feed
        </Link>
      </div>

      {/* Tree or search results */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 min-h-0 mr-1.5">
        {query.length > 1 ? (
          <div>
            {searchResults.length === 0 ? (
              <p className="px-3 py-4 text-sm text-stone-400 text-center">No results found</p>
            ) : (
              searchResults.map(({ item }) => (
                <Link
                  key={item.id}
                  href={`/lectures/${encodeURIComponent(item.id)}`}
                  onClick={() => { setQuery(''); onClose?.() }}
                  className="block px-3 py-2 rounded-lg hover:bg-stone-50 mb-1"
                >
                  <div className="text-sm font-medium text-stone-800 leading-snug">{item.title}</div>
                  <div className="text-xs text-stone-400 truncate">
                    {item.breadcrumb.join(' › ')}
                  </div>
                </Link>
              ))
            )}
          </div>
        ) : (
          categories.map(cat => (
            <div key={cat.id} className="mb-1">
              <TreeItem node={cat} depth={0} activePath={activePath} rabbiParam={rabbiParam} />
            </div>
          ))
        )}
      </nav>

      {/* By Rabbi section */}
      <div className="border-t border-stone-200 shrink-0">
        <button
          onClick={() => setRabbiSectionOpen(o => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-stone-50 transition-colors"
        >
          <span className="flex items-center gap-2">
            <span className="text-sm font-bold text-stone-700">By Rabbi</span>
            {selectedRabbis.length > 0 && (
              <span className="bg-emerald-700 text-white text-xs font-medium px-1.5 py-0.5 rounded-full leading-none">
                {selectedRabbis.length}
              </span>
            )}
          </span>
          <span className={`text-stone-400 text-xs transition-transform duration-150 ${rabbiSectionOpen ? 'rotate-90' : ''}`}>›</span>
        </button>

        {rabbiSectionOpen && (
          <div className="overflow-y-auto px-2 pb-2 mr-1.5" style={{ maxHeight: '220px' }}>
            {selectedRabbis.length > 0 && (
              <button
                onClick={clearRabbis}
                className="w-full text-left px-3 py-1 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                Clear all
              </button>
            )}
            {speakerCounts.map(([canonical, count]) => {
              const isSelected = selectedRabbis.includes(canonical)
              return (
                <button
                  key={canonical}
                  onClick={() => toggleRabbi(canonical)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-sm
                               transition-colors mb-0.5 text-left
                    ${isSelected
                      ? 'bg-emerald-50 text-emerald-800 font-medium'
                      : 'text-stone-600 hover:bg-stone-50'}`}
                >
                  <span className="flex items-center gap-2 truncate">
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors
                      ${isSelected ? 'bg-emerald-700 border-emerald-700' : 'border-stone-300'}`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate">{canonical}</span>
                  </span>
                  <span className="text-xs text-stone-300 ml-2 shrink-0">{count}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Resize handle */}
      <div
        onMouseDown={startResize}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-10 hover:bg-emerald-200 active:bg-emerald-300 transition-colors"
        title="Drag to resize"
      />
    </aside>
  )
}
