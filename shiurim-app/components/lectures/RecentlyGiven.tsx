'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import type { FlatLecture } from '@/lib/lecture-utils'
import { createClient } from '@/lib/supabase-browser'
import LectureCard from './LectureCard'

const PAGE_SIZE = 15

type OverrideMap = Record<string, string>

/** Homepage "Recently Given" list — the newest shiurim by delivery date.
 *  Reuses LectureCard so each shiur is its own card with the full (wrapping)
 *  title, matching the list view on the navigation pages. The caller passes a
 *  pre-sorted, deduped pool of lectures (newest first, up to 200); this
 *  component reveals them 15 at a time via "View More" and fetches speaker
 *  overrides for the whole pool so tiles show the same corrected rabbi names
 *  as the subfolder lecture lists. */
export default function RecentlyGiven({
  lectures,
  userId,
}: {
  lectures: FlatLecture[]
  userId?: string | null
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})

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

  if (lectures.length === 0) return null

  const visibleLectures = lectures.slice(0, visibleCount)
  const hasMore = visibleCount < lectures.length

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">Recently Given</h2>

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

      <div className="flex items-center gap-4 mt-4">
        {hasMore && (
          <button
            onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, lectures.length))}
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
