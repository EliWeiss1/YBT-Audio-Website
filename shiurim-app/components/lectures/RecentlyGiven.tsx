'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { FlatLecture } from '@/lib/lecture-utils'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { createClient } from '@/lib/supabase-browser'
import { useScope } from '@/lib/scope-context'
import LectureCard from './LectureCard'
import MultiSelectFilter from './MultiSelectFilter'

const PAGE_SIZE = 15

type OverrideMap = Record<string, string>

/** Homepage "Recently Given" list — the newest shiurim by delivery date.
 *  Reuses LectureCard so each shiur is its own card with the full (wrapping)
 *  title, matching the list view on the navigation pages. The caller passes
 *  pre-sorted, deduped pools of lectures (newest first, up to 200 each) — one
 *  per library scope, so the top-bar tabs switch instantly with no server round
 *  trip. This component reveals them 15 at a time via "View More", fetches
 *  speaker overrides for the whole pool so tiles show the same corrected rabbi
 *  names as the subfolder lecture lists, and lets the visitor narrow the pool
 *  by rabbi and/or top-level folder (local state only — filtering always runs
 *  against the full pool, so changing a filter immediately reveals up to
 *  PAGE_SIZE matches rather than shrinking the current page). */
export default function RecentlyGiven({
  pools,
  userId,
  folderOrder,
}: {
  pools: { all: FlatLecture[]; yeshiva: FlatLecture[] }
  userId?: string | null
  folderOrder: string[]
}) {
  const { scope } = useScope()
  // 'ttl' has its own page (/ttl) and never renders this, but fall back to the
  // full pool rather than showing nothing if it somehow lands here.
  const inYeshiva = scope === 'yeshiva'
  const lectures = inYeshiva ? pools.yeshiva : pools.all

  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])

  // Switching tabs re-filters against a different pool, so drop selections that
  // may not exist in the new one and start paging again from the top.
  useEffect(() => {
    setSelectedRabbis([])
    setSelectedFolders([])
    setVisibleCount(PAGE_SIZE)
  }, [scope])

  useEffect(() => {
    const supabase = createClient()
    const ids = lectures.map(l => l.id)
    if (ids.length === 0) return

    supabase
      .from('speaker_overrides')
      .select('lecture_id, speaker')
      .in('lecture_id', ids)
      .then(({ data }) => {
        if (data) {
          setOverrideMap(
            Object.fromEntries(data.map((o: { lecture_id: string; speaker: string }) => [o.lecture_id, o.speaker]))
          )
        }
      })
  }, [lectures])

  const effectiveSpeaker = (l: FlatLecture) => overrideMap[l.id] ?? normalizeRabbi(l.speaker)

  const rabbiOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of lectures) {
      const speaker = effectiveSpeaker(l)
      if (!speaker) continue
      counts.set(speaker, (counts.get(speaker) ?? 0) + 1)
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([speaker]) => speaker)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectures, overrideMap])

  const folderOptions = useMemo(() => {
    const present = new Set(lectures.map(l => l.breadcrumb[0]).filter(Boolean))
    return folderOrder.filter(f => present.has(f))
  }, [lectures, folderOrder])

  const filteredLectures = useMemo(() => {
    return lectures.filter(l => {
      const rabbiOk = selectedRabbis.length === 0 || selectedRabbis.includes(effectiveSpeaker(l))
      const folderOk = selectedFolders.length === 0 || selectedFolders.includes(l.breadcrumb[0])
      return rabbiOk && folderOk
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectures, overrideMap, selectedRabbis, selectedFolders])

  function handleRabbiChange(next: string[]) {
    setSelectedRabbis(next)
    setVisibleCount(PAGE_SIZE)
  }

  function handleFolderChange(next: string[]) {
    setSelectedFolders(next)
    setVisibleCount(PAGE_SIZE)
  }

  const heading = inYeshiva ? 'Recently Given in Yeshiva' : 'Recently Given'

  if (lectures.length === 0) {
    if (!inYeshiva) return null
    return (
      <section>
        <h2 className="text-lg font-semibold text-stone-700 mb-4">{heading}</h2>
        <p className="text-sm text-stone-400">
          No shiurim recorded in yeshiva yet. Switch to{' '}
          <span className="text-stone-500">All Community Shiurim</span> to browse everything.
        </p>
      </section>
    )
  }

  const visibleLectures = filteredLectures.slice(0, visibleCount)
  const hasMore = visibleCount < filteredLectures.length

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">{heading}</h2>

      <div className="flex items-center gap-2 mb-4">
        <MultiSelectFilter
          emptyLabel="Rabbi"
          pluralNoun="rabbis"
          allLabel="All rabbis"
          options={rabbiOptions}
          selected={selectedRabbis}
          onChange={handleRabbiChange}
        />
        <MultiSelectFilter
          emptyLabel="Folder"
          pluralNoun="folders"
          allLabel="All folders"
          options={folderOptions}
          selected={selectedFolders}
          onChange={handleFolderChange}
        />
      </div>

      {filteredLectures.length === 0 ? (
        <p className="text-sm text-stone-400 py-4">No recent shiurim match these filters.</p>
      ) : (
        <div className="space-y-2">
          {visibleLectures.map((lec, i) => (
            <LectureCard
              key={lec.id}
              lecture={lec}
              index={i + 1}
              speakerOverride={overrideMap[lec.id]}
              userId={userId}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-4">
        {hasMore && (
          <button
            onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, filteredLectures.length))}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
          >
            View More
          </button>
        )}
        <Link
          href="/lectures"
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
        >
          Browse all shiurim →
        </Link>
      </div>
    </section>
  )
}
