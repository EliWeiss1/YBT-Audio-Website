'use client'

import { useState, useMemo, useRef, useCallback, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { loadTree, loadSpeakerCounts, type CatalogTreeNode } from '@/lib/client-catalog'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import InstallSidebarItem from '@/components/pwa/InstallSidebarItem'

// ─── Recursive tree node ──────────────────────────────────────────────────────

function TreeItem({
  node,
  depth = 0,
  activePath,
  rabbiParam,
}: {
  node: CatalogTreeNode
  depth?: number
  activePath: string[]
  rabbiParam: string
}) {
  const isInActivePath = activePath.includes(node.id)
  const [open, setOpen] = useState(isInActivePath)
  const isLeaf = !node.children || node.children.length === 0
  const lectureCount = isLeaf ? node.count : undefined

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

  // Tree + speaker counts come from tiny generated JSON files (a few KB) —
  // fetched once, service-worker cached, no lecture data in the JS bundle.
  const [tree, setTree] = useState<CatalogTreeNode[]>([])
  const [rawSpeakerCounts, setRawSpeakerCounts] = useState<Record<string, number>>({})

  useEffect(() => {
    let alive = true
    loadTree().then(t => { if (alive) setTree(t) }).catch(() => {})
    loadSpeakerCounts().then(s => { if (alive) setRawSpeakerCounts(s) }).catch(() => {})
    return () => { alive = false }
  }, [])

  const activePath = useMemo(() => {
    if (!activeNodeId) return []
    function findPath(node: CatalogTreeNode, target: string, path: string[]): string[] | null {
      const current = [...path, node.id]
      if (node.id === target) return current
      for (const child of node.children ?? []) {
        const result = findPath(child, target, current)
        if (result) return result
      }
      return null
    }
    for (const cat of tree) {
      const result = findPath(cat, activeNodeId, [])
      if (result) return result
    }
    return []
  }, [activeNodeId, tree])

  // Canonical speaker names sorted by total lecture count descending
  const speakerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const [raw, count] of Object.entries(rawSpeakerCounts)) {
      const canonical = normalizeRabbi(raw)
      if (canonical) counts[canonical] = (counts[canonical] ?? 0) + count
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [rawSpeakerCounts])

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

  return (
    <aside
      className="shrink-0 bg-white border-r border-stone-200 flex flex-col h-full overflow-hidden relative"
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

      {/* Feed + Downloads links */}
      <div className="px-4 py-2 border-b border-stone-100">
        <Link href="/feed"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${pathname === '/feed' ? 'bg-emerald-50 text-emerald-800' : 'text-stone-600 hover:bg-stone-50'}`}>
          <span>🗣️</span> Discussion Feed
        </Link>
        <Link href="/downloads"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${pathname === '/downloads' ? 'bg-emerald-50 text-emerald-800' : 'text-stone-600 hover:bg-stone-50'}`}>
          <span>📲</span> Downloads
          <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 leading-none">
            offline
          </span>
        </Link>
        <Link href="/feedback"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors
            ${pathname === '/feedback' ? 'bg-emerald-50 text-emerald-800' : 'text-stone-600 hover:bg-stone-50'}`}>
          <span>💬</span> Feedback
        </Link>
        <InstallSidebarItem />
      </div>

      {/* Tree */}
      <nav className="flex-1 overflow-y-auto py-2 px-2 min-h-0 mr-1.5">
        {tree.map(cat => (
          <div key={cat.id} className="mb-1">
            <TreeItem node={cat} depth={0} activePath={activePath} rabbiParam={rabbiParam} />
          </div>
        ))}
      </nav>

      {/* By Rabbi section — shrink-0 keeps it pinned at the bottom regardless of tree height */}
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
                <div
                  key={canonical}
                  className={`group flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm
                               transition-colors mb-0.5
                    ${isSelected
                      ? 'bg-emerald-50 text-emerald-800'
                      : 'text-stone-600 hover:bg-stone-50'}`}
                >
                  {/* Checkbox + name — clicking this area toggles the filter */}
                  <button
                    onClick={() => toggleRabbi(canonical)}
                    className="flex items-center gap-2 flex-1 min-w-0 text-left"
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors
                      ${isSelected ? 'bg-emerald-700 border-emerald-700' : 'border-stone-300'}`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </span>
                    <span className={`truncate font-medium ${isSelected ? '' : 'font-normal'}`}>{canonical}</span>
                  </button>

                  <span className="text-xs text-stone-300 shrink-0">{count}</span>

                  {/* "View all" pill — always visible on mobile, hover-only on desktop */}
                  <Link
                    href={`/rabbi/${encodeURIComponent(canonical)}`}
                    onClick={(e) => e.stopPropagation()}
                    className="shrink-0 text-xs text-emerald-600 border border-emerald-200 bg-emerald-50
                               rounded-full px-1.5 py-0.5 leading-none whitespace-nowrap
                               sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                  >
                    View all
                  </Link>
                </div>
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
