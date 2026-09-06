'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
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

// ─── Sub-tab bar ─────────────────────────────────────────────────────────────
// Rendered flush against the top of <main>, styled to read as a continuation of
// the white header — i.e. "a bar that appears under the TTL tab". Sticky so it
// stays reachable while scrolling a several-hundred-item section.

function SectionTabs({ active }: { active: TtlSectionKey }) {
  return (
    <div className="sticky top-0 z-10 bg-white border-b border-stone-200">
      <div className="max-w-4xl mx-auto px-4">
        <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="TTL sections">
          {TTL_SECTIONS.map(section => {
            const isActive = section.key === active
            return (
              <Link
                key={section.key}
                href={`/ttl?section=${section.key}`}
                role="tab"
                aria-selected={isActive}
                scroll={false}
                className={`px-3 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors
                  ${isActive
                    ? 'border-emerald-700 text-emerald-800'
                    : 'border-transparent text-stone-500 hover:text-stone-800'}`}
              >
                {section.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function LoadingSkeleton() {
  return (
    <div>
      <SectionTabs active={DEFAULT_TTL_SECTION} />
      <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">
        <div className="h-9 w-48 bg-stone-100 rounded-lg animate-pulse mb-6" />
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-16 bg-white border border-stone-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function TtlClient() {
  const searchParams = useSearchParams()
  const sectionParam = searchParams.get('section')
  const section: TtlSectionKey = isTtlSection(sectionParam) ? sectionParam : DEFAULT_TTL_SECTION

  const [data, setData] = useState<TtlData | null>(null)
  const [failed, setFailed] = useState(false)
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // ttl.json holds every section, so this is fetched once and switching
  // sub-tabs is instant. The service worker already stale-while-revalidates
  // everything under /lectures-data/.
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

  // Corrected rabbi names, fetched once for the whole pool so sub-tab switches
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

  // Reset paging + rabbi filter when the visitor switches section — the rabbi
  // options are section-scoped, so a carried-over selection could match nothing.
  useEffect(() => {
    setSelectedRabbis([])
    setVisibleCount(PAGE_SIZE)
  }, [section])

  const sectionLectures: TtlLecture[] = useMemo(
    () => data?.sections[section] ?? [],
    [data, section]
  )

  const effectiveSpeaker = (l: TtlLecture) => overrideMap[l.id] ?? normalizeRabbi(l.speaker)

  // Only rabbis who actually have shiurim in *this* section, most first.
  const rabbiOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of sectionLectures) {
      const speaker = effectiveSpeaker(l)
      if (!speaker) continue
      counts.set(speaker, (counts.get(speaker) ?? 0) + 1)
    }
    return Array.from(counts.entries())
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

  const label = TTL_SECTIONS.find(s => s.key === section)!.label

  if (!data && !failed) return <LoadingSkeleton />

  const visibleLectures = filteredLectures.slice(0, visibleCount)
  const hasMore = visibleCount < filteredLectures.length

  return (
    <div>
      <SectionTabs active={section} />

      <div className="px-4 py-6 sm:p-8 max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-stone-900">{label}</h1>
          <p className="text-stone-400 text-sm mt-1">
            {filteredLectures.length.toLocaleString()} shiur{filteredLectures.length !== 1 ? 'im' : ''}
            {selectedRabbis.length > 0 && ` of ${sectionLectures.length.toLocaleString()}`}
            {' · ordered by shiur number'}
          </p>
        </div>

        {failed ? (
          <p className="text-sm text-stone-400 py-4">
            Couldn&apos;t load the TTL shiurim. Please refresh to try again.
          </p>
        ) : (
          <>
            {rabbiOptions.length > 1 && (
              <div className="flex items-center gap-2 mb-4">
                <MultiSelectFilter
                  emptyLabel="Rabbi"
                  pluralNoun="rabbis"
                  allLabel="All rabbis"
                  options={rabbiOptions}
                  selected={selectedRabbis}
                  onChange={handleRabbiChange}
                />
              </div>
            )}

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
      </div>
    </div>
  )
}
