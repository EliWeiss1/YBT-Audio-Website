'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import {
  DEFAULT_TTL_SECTION,
  TTL_SECTIONS,
  isTtlSection,
  type TtlData,
  type TtlLecture,
  type TtlSectionKey,
} from '@/lib/ttl-sections'
import LectureCard from '@/components/lectures/LectureCard'
import MultiSelectFilter from '@/components/lectures/MultiSelectFilter'

const PAGE_SIZE = 25

/** Supabase `.in()` builds a GET query string, so the whole TTL pool (~1,150
 *  ids) has to go over in batches or the URL blows past the server's limit. */
const OVERRIDE_CHUNK = 200

type OverrideMap = Record<string, string>

// ─── Section switcher ────────────────────────────────────────────────────────
// Sits where "Recently Given" sits on the other tabs. Wraps rather than
// scrolls, so all five sections are always reachable without a scrollbar:
// one row on desktop, two on a phone.

function SectionTabs({
  active,
  counts,
  onSelect,
}: {
  active: TtlSectionKey
  counts: Partial<Record<TtlSectionKey, number>>
  onSelect: (key: TtlSectionKey) => void
}) {
  return (
    <div className="mb-5 rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-stone-50 p-1.5">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="TTL sections">
        {TTL_SECTIONS.map(section => {
          const isActive = section.key === active
          const count = counts[section.key]
          return (
            <button
              key={section.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onSelect(section.key)}
              className={`flex-1 min-w-[6rem] rounded-xl px-3 py-2 text-left transition-all
                ${isActive
                  ? 'bg-white shadow-sm ring-1 ring-emerald-200'
                  : 'hover:bg-white/70'}`}
            >
              <span className={`block text-sm font-semibold leading-tight
                ${isActive ? 'text-emerald-800' : 'text-stone-600'}`}
              >
                {section.label}
              </span>
              <span className={`block text-xs tabular-nums mt-0.5
                ${isActive ? 'text-emerald-600' : 'text-stone-400'}`}
              >
                {count === undefined ? ' ' : count.toLocaleString()}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function SectionSkeleton() {
  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">TTL Shiurim</h2>
      <SectionTabs active={DEFAULT_TTL_SECTION} counts={{}} onSelect={() => {}} />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-16 bg-white border border-stone-100 rounded-xl animate-pulse" />
        ))}
      </div>
    </section>
  )
}

// ─── Browser ─────────────────────────────────────────────────────────────────

export default function TtlClient({ userId }: { userId?: string | null }) {
  const searchParams = useSearchParams()
  const initialSection = searchParams.get('section')

  // Section lives in component state, mirrored into the URL with history.
  // pushState rather than a router navigation: ttl.json already holds every
  // section, so switching is instant and a server round trip would only add
  // latency. The URL stays shareable and the back button still works.
  const [section, setSection] = useState<TtlSectionKey>(
    isTtlSection(initialSection) ? initialSection : DEFAULT_TTL_SECTION
  )

  const [data, setData] = useState<TtlData | null>(null)
  const [failed, setFailed] = useState(false)
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  const selectSection = useCallback((key: TtlSectionKey) => {
    setSection(key)
    setSelectedRabbis([])
    setVisibleCount(PAGE_SIZE)
    window.history.pushState(null, '', `/ttl?section=${key}`)
  }, [])

  // Keep the browser's back/forward buttons in step with the pushed entries.
  useEffect(() => {
    function onPopState() {
      const key = new URLSearchParams(window.location.search).get('section')
      setSection(isTtlSection(key) ? key : DEFAULT_TTL_SECTION)
      setSelectedRabbis([])
      setVisibleCount(PAGE_SIZE)
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // ttl.json holds every section, so this is fetched once. The service worker
  // already stale-while-revalidates everything under /lectures-data/.
  useEffect(() => {
    let cancelled = false
    fetch('/lectures-data/ttl.json')
      .then(r => {
        if (!r.ok) throw new Error(`ttl fetch failed: ${r.status}`)
        return r.json() as Promise<TtlData>
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [])

  // Corrected rabbi names, fetched once for the whole pool so section switches
  // need no refetch. Same table/shape as RecentlyGiven and LecturesClient.
  useEffect(() => {
    if (!data) return
    const ids = Object.values(data.sections).flat().map(l => l.id)
    if (ids.length === 0) return

    const supabase = createClient()
    const chunks: string[][] = []
    for (let i = 0; i < ids.length; i += OVERRIDE_CHUNK) {
      chunks.push(ids.slice(i, i + OVERRIDE_CHUNK))
    }

    let cancelled = false
    Promise.all(
      chunks.map(chunk =>
        supabase.from('speaker_overrides').select('lecture_id, speaker').in('lecture_id', chunk)
      )
    ).then(results => {
      if (cancelled) return
      const map: OverrideMap = {}
      for (const { data: rows } of results) {
        for (const row of (rows ?? []) as { lecture_id: string; speaker: string }[]) {
          map[row.lecture_id] = row.speaker
        }
      }
      setOverrideMap(map)
    })
    return () => { cancelled = true }
  }, [data])

  const counts = useMemo(() => {
    if (!data) return {}
    return Object.fromEntries(
      Object.entries(data.sections).map(([key, list]) => [key, list.length])
    ) as Partial<Record<TtlSectionKey, number>>
  }, [data])

  const sectionLectures: TtlLecture[] = useMemo(
    () => data?.sections[section] ?? [],
    [data, section]
  )

  const effectiveSpeaker = (l: TtlLecture) => overrideMap[l.id] ?? normalizeRabbi(l.speaker)

  // Only rabbis who actually have shiurim in *this* section, most first.
  const rabbiOptions = useMemo(() => {
    const tally = new Map<string, number>()
    for (const l of sectionLectures) {
      const speaker = effectiveSpeaker(l)
      if (!speaker) continue
      tally.set(speaker, (tally.get(speaker) ?? 0) + 1)
    }
    return Array.from(tally.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([speaker]) => speaker)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionLectures, overrideMap])

  const filteredLectures = useMemo(() => {
    if (selectedRabbis.length === 0) return sectionLectures
    return sectionLectures.filter(l => selectedRabbis.includes(effectiveSpeaker(l)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sectionLectures, overrideMap, selectedRabbis])

  function handleRabbiChange(next: string[]) {
    setSelectedRabbis(next)
    setVisibleCount(PAGE_SIZE)
  }

  if (!data && !failed) return <SectionSkeleton />

  const label = TTL_SECTIONS.find(s => s.key === section)!.label
  const visibleLectures = filteredLectures.slice(0, visibleCount)
  const hasMore = visibleCount < filteredLectures.length

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">TTL Shiurim</h2>

      <SectionTabs active={section} counts={counts} onSelect={selectSection} />

      {failed ? (
        <p className="text-sm text-stone-400 py-4">
          Couldn&apos;t load the TTL shiurim. Please refresh to try again.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-4">
            {rabbiOptions.length > 1 ? (
              <MultiSelectFilter
                emptyLabel="Rabbi"
                pluralNoun="rabbis"
                allLabel="All rabbis"
                options={rabbiOptions}
                selected={selectedRabbis}
                onChange={handleRabbiChange}
              />
            ) : <span />}
            <span className="shrink-0 text-xs text-stone-400">
              {selectedRabbis.length > 0
                ? `${filteredLectures.length.toLocaleString()} of ${sectionLectures.length.toLocaleString()}`
                : `${sectionLectures.length.toLocaleString()} shiurim`}
              {' · by shiur number'}
            </span>
          </div>

          {filteredLectures.length === 0 ? (
            <p className="text-sm text-stone-400 py-4">
              {selectedRabbis.length > 0
                ? `No shiurim by ${selectedRabbis.join(' or ')} in ${label}.`
                : `No shiurim in ${label} yet.`}
            </p>
          ) : (
            <div className="space-y-2">
              {visibleLectures.map(lec => (
                <LectureCard
                  key={lec.id}
                  lecture={lec}
                  index={lec.ttlNumber}
                  speakerOverride={overrideMap[lec.id]}
                  userId={userId}
                />
              ))}
            </div>
          )}

          {hasMore && (
            <button
              onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, filteredLectures.length))}
              className="mt-4 text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
            >
              View More
            </button>
          )}
        </>
      )}
    </section>
  )
}
