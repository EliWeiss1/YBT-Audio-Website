  'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import Fuse from 'fuse.js'
import { categories, getAllLectures, TreeNode } from '@/lib/lectures'

// ─── Recursive tree node ──────────────────────────────────────────────────────

function TreeItem({
  node,
  depth = 0,
  activePath,
}: {
  node: TreeNode
  depth?: number
  activePath: string[]
}) {
  const isInActivePath = activePath.includes(node.id)
  const [open, setOpen] = useState(isInActivePath)
  const isLeaf = !node.children || node.children.length === 0
  const lectureCount = node.lectures?.length

  // Leaf node — links to the browse page for this node
  if (isLeaf) {
    const href = `/lectures?node=${node.id}`
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

  // Branch node — expandable
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
  const activeNodeId = searchParams.get('node') ?? ''
  const [query, setQuery] = useState('')

  // Build active path for auto-expanding the tree
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

  // Fuzzy search across all lectures
  const allLectures = useMemo(() => getAllLectures(), [])
  const fuse = useMemo(() => new Fuse(allLectures, {
    keys: ['title', 'description', 'speaker', 'tags', 'breadcrumb'],
    threshold: 0.3,
  }), [allLectures])
  const searchResults = query.length > 1 ? fuse.search(query).slice(0, 14) : []

  return (
    <aside className="w-[280px] shrink-0 bg-white border-r border-stone-200 flex flex-col h-screen overflow-hidden">
      {/* Logo + mobile close button */}
      <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2" onClick={onClose}>
          <span className="text-2xl">📚</span>
          <div>
            <div className="font-bold text-stone-900 leading-tight">Shiurim</div>
            <div className="text-xs text-stone-400">Library</div>
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
      <nav className="flex-1 overflow-y-auto py-2 px-2">
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
                  <div className="text-sm font-medium text-stone-800 truncate">{item.title}</div>
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
              <TreeItem node={cat} depth={0} activePath={activePath} />
            </div>
          ))
        )}
      </nav>

      {/* Auth */}
      <div className="px-4 py-3 border-t border-stone-200">
        <Link href="/auth"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-stone-500 hover:bg-stone-50 transition-colors">
          <span>👤</span> Sign in / Sign up
        </Link>
      </div>
    </aside>
  )
}