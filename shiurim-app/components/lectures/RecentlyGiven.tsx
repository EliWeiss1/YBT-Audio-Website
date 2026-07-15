'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { FlatLecture } from '@/lib/lecture-utils'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { createClient } from '@/lib/supabase-browser'
import LectureCard from './LectureCard'
import MultiSelectFilter from './MultiSelectFilter'

const PAGE_SIZE = 15

type OverrideMap = Record<string, string>

/** Homepage "Recently Given" list — the newest shiurim by delivery date.
 *  Reuses LectureCard so each shiur is its own card with the full (wrapping)
 *  title, matching the list view on the navigation pages. The caller passes a
 *  pre-sorted, deduped pool of lectures (newest first, up to 200); this
 *  component reveals them 15 at a time via "View More", fetches speaker
 *  overrides for the whole pool so tiles show the same corrected rabbi names
 *  as the subfolder lecture lists, and lets the visitor narrow the pool by
 *  rabbi and/or top-level folder (local state only — filtering always runs
 *  against the full pool, so changing a filter immediately reveals up to
 *  PAGE_SIZE matches rather than shrinking the current page). */
export default function RecentlyGiven({
  lectures,
  userId,
  folderOrder,
}: {
  lectures: FlatLecture[]
  userId?: string | null
  folderOrder: string[]
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])

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

  const rabbiOptions = useMemo(
    () => Array.from(new Set(lectures.map(effectiveSpeaker).filter(Boolean))).sort(),
    [lectures, overrideMap]
  )

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

  if (lectures.length === 0) return null

  const visibleLectures = filteredLectures.slice(0, visibleCount)
  const hasMore = visibleCount < filteredLectures.length

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">Recently Given</h2>

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
