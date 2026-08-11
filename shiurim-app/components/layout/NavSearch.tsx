'use client'

import React, { useState, useMemo, useRef, useEffect } from 'react'
import Link from 'next/link'
import Fuse from 'fuse.js'
import type { FlatLecture } from '@/lib/lecture-utils'
import { formatDuration, parseLectureDate } from '@/lib/lecture-utils'
import { loadCatalog } from '@/lib/client-catalog'
import { normalizeRabbi } from '@/lib/rabbi-normalization'

// ─── Highlight helper ─────────────────────────────────────────────────────────

// Compile highlight regex once per query — passed into ResultRow as a prop
function buildHighlightRegex(query: string): RegExp | null {
  if (!query || query.length < 2) return null
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(${escaped})`, 'gi')
}

function highlight(text: string, regex: RegExp | null): React.ReactNode {
  if (!regex) return text
  regex.lastIndex = 0
  const parts = text.split(regex)
  regex.lastIndex = 0
  return parts.map((part, i) =>
    i % 2 === 1
      ? <mark key={i} className="bg-transparent text-[#534AB7] font-semibold not-italic">{part}</mark>
      : part
  )
}

// ─── Result row ───────────────────────────────────────────────────────────────

const ResultRow = React.memo(function ResultRow({
  lecture, regex, onClose
}: {
  lecture: FlatLecture
  regex: RegExp | null
  onClose: () => void
}) {
  const category = lecture.breadcrumb[0] ?? ''
  const dateStr = lecture.date
    ? parseLectureDate(lecture.date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : ''
  const dur = lecture.duration ? formatDuration(lecture.duration) : ''

  return (
    <Link
      href={`/lectures/${encodeURIComponent(lecture.id)}`}
      onClick={onClose}
      className="block px-4 py-3 hover:bg-stone-50 border-b border-stone-100 last:border-0 transition-colors"
    >
      <div className="text-sm font-medium text-stone-800 leading-snug">
        {highlight(lecture.title, regex)}
      </div>
      <div className="text-xs text-stone-400 mt-0.5 flex flex-wrap gap-x-2">
        {lecture.speaker && <span>{highlight(lecture.speaker, regex)}</span>}
        {category && <span>{category}</span>}
        {dateStr && <span>{dateStr}</span>}
        {dur && <span>{dur}</span>}
      </div>
    </Link>
  )
})

// ─── NavSearch ────────────────────────────────────────────────────────────────

export default function NavSearch({ onMobileSearchChange }: { onMobileSearchChange?: (active: boolean) => void }) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [mobileSearchActive, setMobileSearchActive] = useState(false)
  const [rabbiDropdownOpen, setRabbiDropdownOpen] = useState(false)
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [sortMode, setSortMode] = useState<'relevance' | 'newest' | 'oldest'>('relevance')

  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const desktopContainerRef = useRef<HTMLDivElement>(null)
  const mobileContainerRef = useRef<HTMLDivElement>(null)

  // ── Deferred init: runs after first paint so it doesn't block page load ──
  const [allLectures, setAllLectures] = useState<FlatLecture[]>([])
  const [fuse, setFuse] = useState<Fuse<FlatLecture> | null>(null)

  useEffect(() => {
    // Catalog is fetched (and service-worker cached) rather than bundled —
    // keeps megabytes of lecture data out of the initial JS payload.
    let alive = true
    loadCatalog()
      .then(lectures => {
        if (!alive) return
        setAllLectures(lectures)
        setFuse(new Fuse(lectures, {
          keys: [
            { name: 'title', weight: 3 },
            { name: 'speaker', weight: 1.5 },
            { name: 'tags', weight: 1 },
            { name: 'breadcrumb', weight: 0.5 },
            { name: 'description', weight: 0.5 },
          ],
          threshold: 0.2,
          includeMatches: false,
          distance: 80,
          minMatchCharLength: 2,
        }))
      })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // ── 150ms debounce: Fuse only runs after typing pauses ──
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(t)
  }, [query])

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

  const rawResults: FlatLecture[] = useMemo(() => {
    if (!fuse || debouncedQuery.length < 2) return []
    const lowerQuery = debouncedQuery.toLowerCase()

    // Always include exact substring matches in title — catches codes like "D-4"
    // that Fuse's bitap algorithm scores poorly due to hyphens/special chars
    const exactIds = new Set<string>()
    const exactMatches = allLectures.filter(l => {
      if (l.title.toLowerCase().includes(lowerQuery)) {
        exactIds.add(l.id)
        return true
      }
      return false
    })

    // Fuse fuzzy results for everything else
    const fuseResults = fuse.search(debouncedQuery)
    const fuzzyOnly = fuseResults
      .filter(r => !exactIds.has(r.item.id))
      .map(r => r.item)

    // Cap at 200 — rendering 400+ rows at once causes the freeze
    return [...exactMatches, ...fuzzyOnly].slice(0, 200)
  }, [fuse, debouncedQuery, allLectures])

  // Rabbi counts from current search results only — drives dropdown order + counts
  const resultSpeakerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const l of rawResults) {
      if (l.speaker) {
        const canonical = normalizeRabbi(l.speaker)
        counts[canonical] = (counts[canonical] ?? 0) + 1
      }
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])
  }, [rawResults])

  // Available categories from current raw results
  const availableCategories = useMemo(() => {
    const seen: Record<string, boolean> = {}
    for (const l of rawResults) {
      if (l.breadcrumb[0]) seen[l.breadcrumb[0]] = true
    }
    return Object.keys(seen).sort()
  }, [rawResults])

  // Apply rabbi + category filters, then sort
  const filteredResults = useMemo(() => {
    let results = rawResults

    if (selectedRabbis.length > 0) {
      results = results.filter(l => selectedRabbis.includes(normalizeRabbi(l.speaker)))
    }
    if (selectedCategories.length > 0) {
      results = results.filter(l => selectedCategories.includes(l.breadcrumb[0]))
    }

    if (sortMode !== 'relevance') {
      results = [...results].sort((a, b) => {
        const da = a.date ?? ''
        const db = b.date ?? ''
        return sortMode === 'newest' ? db.localeCompare(da) : da.localeCompare(db)
      })
    }

    return results
  }, [rawResults, selectedRabbis, selectedCategories, sortMode])

  // Build regex once per debounced query — shared across all ResultRow renders
  const highlightRegex = useMemo(() => buildHighlightRegex(debouncedQuery), [debouncedQuery])

  const hasResults = debouncedQuery.length >= 2
  const showPanel = open && hasResults

  function closeAll() {
    setQuery('')
    setOpen(false)
    setRabbiDropdownOpen(false)
    setSelectedRabbis([])
    setSelectedCategories([])
  }

  function closePanel() {
    setQuery('')
    setOpen(false)
    setRabbiDropdownOpen(false)
  }

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      const inPanel = panelRef.current?.contains(target)
      const inDesktop = desktopContainerRef.current?.contains(target)
      const inMobile = mobileContainerRef.current?.contains(target)
      if (!inPanel && !inDesktop && !inMobile) {
        setOpen(false)
        setRabbiDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  // Escape key
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closePanel()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  function handleQueryChange(val: string) {
    setQuery(val)
    setOpen(val.length >= 2)
    if (val.length < 2) {
      setSelectedCategories([])
    }
    // Exit mobile search mode when bar is fully cleared
    if (val === '' && mobileSearchActive) {
      setMobileSearchActive(false)
      onMobileSearchChange?.(false)
    }
  }

  function toggleRabbi(canonical: string) {
    setSelectedRabbis(prev =>
      prev.includes(canonical) ? prev.filter(r => r !== canonical) : [...prev, canonical]
    )
  }

  function toggleCategory(cat: string) {
    setSelectedCategories(prev =>
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    )
  }

  function removeRabbi(canonical: string) {
    setSelectedRabbis(prev => prev.filter(r => r !== canonical))
  }

  function removeCategory(cat: string) {
    setSelectedCategories(prev => prev.filter(c => c !== cat))
  }

  const activeSummary = selectedRabbis.length > 0 || selectedCategories.length > 0

  // ─── Search input JSX ────────────────────────────────────────────────────────
  // Kept as a plain JSX variable (not a <Component />) so React never unmounts
  // the <input> on re-render — which would cause focus loss on every keystroke.

  const searchInputJSX = (
    <div className="relative flex-1">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 text-sm pointer-events-none">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
      </span>
      <input
        ref={inputRef}
        type="text"
        placeholder="Search shiurim..."
        value={query}
        onChange={e => handleQueryChange(e.target.value)}
        onFocus={() => { if (query.length >= 2) setOpen(true) }}
        className="w-full pl-9 pr-8 py-2 text-sm bg-stone-50 border border-stone-200 rounded-lg
                   focus:outline-none focus:border-[#534AB7] focus:ring-1 focus:ring-[#534AB7]/30"
      />
      {query && (
        <button
          onClick={closePanel}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 p-0.5"
          aria-label="Clear search"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  )

  // ─── Filter bar ───────────────────────────────────────────────────────────────

  const FilterBar = () => (
    <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-stone-200">
      {/* Rabbi dropdown — fixed left */}
      <div className="relative shrink-0">
        <button
          onClick={() => setRabbiDropdownOpen(o => !o)}
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap
            ${selectedRabbis.length > 0
              ? 'bg-[#EEEDFE] text-[#3C3489] border-[#AFA9EC]'
              : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
        >
          {selectedRabbis.length > 0 ? `${selectedRabbis.length} rabbi${selectedRabbis.length > 1 ? 's' : ''}` : 'Rabbi'}
          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {rabbiDropdownOpen && (
          <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-stone-200 rounded-lg shadow-md z-50 overflow-hidden">
            <div className="overflow-y-auto" style={{ maxHeight: '220px' }}>
              {resultSpeakerCounts.map(([canonical, count]) => {
                const isSelected = selectedRabbis.includes(canonical)
                return (
                  <button
                    key={canonical}
                    onClick={() => toggleRabbi(canonical)}
                    className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors
                      ${isSelected ? 'bg-[#EEEDFE] text-[#3C3489]' : 'text-stone-700 hover:bg-stone-50'}`}
                  >
                    <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0 transition-colors
                      ${isSelected ? 'bg-[#534AB7] border-[#534AB7]' : 'border-stone-300'}`}>
                      {isSelected && (
                        <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </span>
                    <span className="truncate flex-1">{canonical}</span>
                    <span className={`text-xs tabular-nums shrink-0 ${isSelected ? 'text-[#7F77DD]' : 'text-stone-400'}`}>{count}</span>
                  </button>
                )
              })}
            </div>
            {selectedRabbis.length > 0 && (
              <div className="border-t border-stone-100">
                <button
                  onClick={() => setSelectedRabbis([])}
                  className="w-full px-3 py-2 text-xs text-stone-400 hover:text-stone-600 text-left transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Category pills — horizontally scrollable middle */}
      <div className="flex items-center gap-2 overflow-x-auto flex-1 min-w-0 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {availableCategories.map(cat => (
          <button
            key={cat}
            onClick={() => toggleCategory(cat)}
            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
              ${selectedCategories.includes(cat)
                ? 'bg-[#EEEDFE] text-[#3C3489] border-[#AFA9EC]'
                : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Date sort pill — fixed right, cycles relevance → newest → oldest → relevance */}
      <button
        onClick={() => setSortMode(m => m === 'relevance' ? 'newest' : m === 'newest' ? 'oldest' : 'relevance')}
        className={`shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
          ${sortMode !== 'relevance'
            ? 'bg-[#EEEDFE] text-[#3C3489] border-[#AFA9EC]'
            : 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50'}`}
      >
        {sortMode === 'newest' ? 'Newest first' : sortMode === 'oldest' ? 'Oldest first' : 'Best match'}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      </button>
    </div>
  )

  // ─── Results panel ────────────────────────────────────────────────────────────

  const ResultsPanel = () => (
    <div
      ref={panelRef}
      className="absolute left-0 right-0 top-full z-50 bg-white border-b border-x border-stone-200 rounded-b-lg shadow-sm overflow-hidden"
      style={{ maxHeight: '70vh' }}
    >
      <FilterBar />

      {/* Always-visible count bar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-stone-50 border-b border-stone-200 flex-wrap text-xs text-stone-500">
        <span className="font-medium text-stone-600">
          {activeSummary ? `${filteredResults.length} of ${rawResults.length}` : `${rawResults.length}`} shiurim
        </span>
        {selectedRabbis.map(r => (
          <span key={r} className="flex items-center gap-1 bg-[#EEEDFE] text-[#3C3489] border border-[#AFA9EC] rounded-full px-2 py-0.5">
            {r}
            <button onClick={() => removeRabbi(r)} className="hover:text-[#534AB7]">×</button>
          </span>
        ))}
        {selectedCategories.map(c => (
          <span key={c} className="flex items-center gap-1 bg-[#EEEDFE] text-[#3C3489] border border-[#AFA9EC] rounded-full px-2 py-0.5">
            {c}
            <button onClick={() => removeCategory(c)} className="hover:text-[#534AB7]">×</button>
          </span>
        ))}
      </div>

      <div className="overflow-y-auto" style={{ maxHeight: 'calc(70vh - 100px)' }}>
        {filteredResults.length === 0 ? (
          <p className="px-4 py-8 text-sm text-stone-400 text-center">No results found</p>
        ) : (
          filteredResults.map(lecture => (
            <ResultRow key={lecture.id} lecture={lecture} regex={highlightRegex} onClose={closeAll} />
          ))
        )}
      </div>
    </div>
  )

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Desktop search bar — right-aligned */}
      <div ref={desktopContainerRef} className="hidden md:flex ml-auto w-72">
        {searchInputJSX}
      </div>

      {/* Mobile: icon or expanded search */}
      {!mobileSearchActive ? (
        <button
          className="md:hidden p-2 rounded-lg text-stone-500 hover:bg-stone-100 transition-colors"
          onClick={() => {
            setMobileSearchActive(true)
            onMobileSearchChange?.(true)
            setTimeout(() => inputRef.current?.focus(), 50)
          }}
          aria-label="Search"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
        </button>
      ) : (
        <div ref={mobileContainerRef} className="md:hidden flex items-center gap-2 flex-1">
          <button
            onClick={() => {
              setMobileSearchActive(false)
              onMobileSearchChange?.(false)
              closePanel()
            }}
            className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 transition-colors shrink-0"
            aria-label="Back"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          {searchInputJSX}
        </div>
      )}

      {showPanel && <ResultsPanel />}
    </>
  )
}
