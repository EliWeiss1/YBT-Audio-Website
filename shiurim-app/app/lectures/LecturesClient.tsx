'use client'

import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { createClient } from '@/lib/supabase-browser'
import LectureListWithProgress from '@/components/lectures/LectureListWithProgress'
import Link from 'next/link'
import type { Lecture } from '@/lib/lecture-utils'

// ─── Types for CDN-fetched node data ─────────────────────────────────────────

type CategorySummary = {
  id: string
  label: string
  icon?: string | null
  count: number
}

type ChildSummary = {
  id: string
  label: string
  count: number
  sectionCount: number
  isLeaf: boolean
}

type BreadcrumbItem = {
  id: string
  label: string
}

type RootData = {
  categories: CategorySummary[]
}

type NodePageData = {
  id: string
  label: string
  totalCount: number
  breadcrumb: BreadcrumbItem[]
  children: ChildSummary[] | null
  lectures: Lecture[] | null
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function LoadingSkeleton() {
  return (
    <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-8 h-9 bg-stone-100 rounded-lg w-48 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-stone-200 p-5 animate-pulse">
            <div className="h-8 w-8 bg-stone-100 rounded mb-3" />
            <div className="h-4 bg-stone-100 rounded w-3/4 mb-2" />
            <div className="h-3 bg-stone-100 rounded w-1/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Main client component ────────────────────────────────────────────────────

export default function LecturesClient() {
  const searchParams = useSearchParams()
  const nodeId = searchParams.get('node') ?? undefined
  const rabbiParam = searchParams.get('rabbi') ?? undefined

  const selectedRabbis = rabbiParam
    ? rabbiParam.split(',').map(r => decodeURIComponent(r.trim())).filter(Boolean)
    : []

  const [data, setData] = useState<RootData | NodePageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [overrideMap, setOverrideMap] = useState<Record<string, string>>({})

  // Fetch node data from CDN
  useEffect(() => {
    setLoading(true)
    const url = nodeId
      ? `/lectures-data/${nodeId}.json`
      : '/lectures-data/index.json'
    fetch(url)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
  }, [nodeId])

  // After node data loads, fetch speaker overrides for this node's lectures
  useEffect(() => {
    const lectures = (data as NodePageData)?.lectures
    if (!lectures || lectures.length === 0) { setOverrideMap({}); return }
    const supabase = createClient()
    supabase
      .from('speaker_overrides')
      .select('lecture_id, speaker')
      .in('lecture_id', lectures.map((l: Lecture) => l.id))
      .then(({ data: rows }) => {
        setOverrideMap(
          rows
            ? Object.fromEntries(
                rows.map((r: { lecture_id: string; speaker: string }) => [r.lecture_id, r.speaker])
              )
            : {}
        )
      })
  }, [data])

  if (loading || !data) return <LoadingSkeleton />

  // Root view
  if ('categories' in data) {
    return (
      <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-stone-900">All Shiurim</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {data.categories.map(cat => (
            <Link
              key={cat.id}
              href={`/lectures?node=${cat.id}`}
              className="bg-white rounded-xl border border-stone-200 p-5 hover:border-emerald-200 hover:shadow-sm transition-all group"
            >
              <div className="text-3xl mb-3">{cat.icon ?? '📁'}</div>
              <h3 className="font-semibold text-stone-900 group-hover:text-emerald-800 transition-colors mb-1">
                {cat.label}
              </h3>
              <p className="text-sm text-stone-400">{cat.count} shiurim</p>
            </Link>
          ))}
        </div>
      </div>
    )
  }

  // Node view
  const node = data as NodePageData
  const breadcrumb = node.breadcrumb

  return (
    <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        {breadcrumb.length > 1 && (
          <div className="flex items-center gap-1.5 text-sm text-stone-400 mb-2 flex-wrap">
            <Link href="/lectures" className="hover:text-stone-600">All</Link>
            {breadcrumb.slice(0, -1).map(item => (
              <span key={item.id} className="flex items-center gap-1.5">
                <span>›</span>
                <Link href={`/lectures?node=${item.id}`} className="hover:text-stone-600">
                  {item.label}
                </Link>
              </span>
            ))}
            <span>›</span>
          </div>
        )}
        <h1 className="text-3xl font-bold text-stone-900">{node.label}</h1>
        <p className="text-stone-400 text-sm mt-1">{node.totalCount} shiurim</p>
      </div>

      <NodeContent node={node} selectedRabbis={selectedRabbis} overrideMap={overrideMap} />
    </div>
  )
}

// ─── RabbiFilter ─────────────────────────────────────────────────────────────

function RabbiFilter({
  lectures,
  nodeId,
  selectedRabbis,
  overrideMap,
}: {
  lectures: Lecture[]
  nodeId: string
  selectedRabbis: string[]
  overrideMap: Record<string, string>
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const speakers = Array.from(
    new Set(lectures.map(l => overrideMap[l.id] ?? normalizeRabbi(l.speaker)).filter(Boolean))
  ).sort()

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (speakers.length < 2 && selectedRabbis.length === 0) return null

  function toggledHref(canonical: string): string {
    const next = selectedRabbis.includes(canonical)
      ? selectedRabbis.filter(r => r !== canonical)
      : [...selectedRabbis, canonical]
    if (next.length === 0) return `/lectures?node=${nodeId}`
    return `/lectures?node=${nodeId}&rabbi=${next.map(encodeURIComponent).join(',')}`
  }

  const label = selectedRabbis.length === 0
    ? 'Rabbi'
    : selectedRabbis.length === 1
      ? selectedRabbis[0]
      : `${selectedRabbis.length} rabbis`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors
          ${selectedRabbis.length > 0
            ? 'bg-emerald-700 text-white border-emerald-700'
            : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700'}`}
      >
        {label}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden min-w-[180px]">
          <Link
            href={`/lectures?node=${nodeId}`}
            className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors
              ${selectedRabbis.length === 0 ? 'bg-emerald-50 text-emerald-800' : 'text-stone-700 hover:bg-stone-50'}`}
          >
            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0
              ${selectedRabbis.length === 0 ? 'bg-emerald-700 border-emerald-700' : 'border-stone-300'}`}>
              {selectedRabbis.length === 0 && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                </svg>
              )}
            </span>
            All rabbis
          </Link>
          <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
            {speakers.map(canonical => {
              const isSelected = selectedRabbis.includes(canonical)
              return (
                <Link
                  key={canonical}
                  href={toggledHref(canonical)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors
                    ${isSelected ? 'bg-emerald-50 text-emerald-800' : 'text-stone-700 hover:bg-stone-50'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0
                    ${isSelected ? 'bg-emerald-700 border-emerald-700' : 'border-stone-300'}`}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </span>
                  {canonical}
                </Link>
              )
            })}
          </div>
          {selectedRabbis.length > 0 && (
            <div className="border-t border-stone-100">
              <Link
                href={`/lectures?node=${nodeId}`}
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                Clear all
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── NodeContent ──────────────────────────────────────────────────────────────

function NodeContent({
  node,
  selectedRabbis,
  overrideMap,
}: {
  node: NodePageData
  selectedRabbis: string[]
  overrideMap: Record<string, string>
}) {
  const [sortOrder, setSortOrder] = useState<'default' | 'newest' | 'oldest'>('default')

  const hasChildren = node.children && node.children.length > 0
  const hasLectures = node.lectures && node.lectures.length > 0

  const effectiveSpeaker = (l: Lecture) => overrideMap[l.id] ?? normalizeRabbi(l.speaker)

  const filteredLectures = (() => {
    const base = hasLectures
      ? (selectedRabbis.length > 0
          ? node.lectures!.filter(l => selectedRabbis.includes(effectiveSpeaker(l)))
          : node.lectures!)
      : []
    if (sortOrder === 'default') return base
    return [...base].sort((a, b) => {
      const da = a.date ?? ''
      const db = b.date ?? ''
      return sortOrder === 'newest' ? db.localeCompare(da) : da.localeCompare(db)
    })
  })()

  return (
    <div className="space-y-8">
      {hasChildren && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {node.children!.map(child => (
            <Link
              key={child.id}
              href={`/lectures?node=${child.id}`}
              className="bg-white rounded-xl border border-stone-200 p-5 hover:border-emerald-200 hover:shadow-sm transition-all group"
            >
              <h3 className="font-semibold text-stone-900 group-hover:text-emerald-800 transition-colors mb-1">
                {child.label}
              </h3>
              <p className="text-sm text-stone-400">
                {child.count} shiur{child.count !== 1 ? 'im' : ''}
                {!child.isLeaf && child.sectionCount > 0 && (
                  <span className="ml-1 text-stone-300">
                    · {child.sectionCount} sections
                  </span>
                )}
              </p>
            </Link>
          ))}
        </div>
      )}

      {hasLectures && (
        <div>
          {hasChildren && (
            <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
              General
            </h2>
          )}

          <div className="flex items-center justify-between gap-3 mb-5">
            <RabbiFilter
              lectures={node.lectures!}
              nodeId={node.id}
              selectedRabbis={selectedRabbis}
              overrideMap={overrideMap}
            />
            <button
              onClick={() => setSortOrder(s => s === 'default' ? 'newest' : s === 'newest' ? 'oldest' : 'default')}
              className={`shrink-0 flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
                ${sortOrder !== 'default'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'}`}
            >
              {sortOrder === 'newest' ? 'Newest first' : sortOrder === 'oldest' ? 'Oldest first' : 'Date'}
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {filteredLectures.length === 0 ? (
            <p className="text-sm text-stone-400 py-4">
              No shiurim by {selectedRabbis.join(' or ')} in this section.
            </p>
          ) : (
            <LectureListWithProgress
              lectures={filteredLectures}
              nodeId={node.id}
            />
          )}
        </div>
      )}
    </div>
  )
}
