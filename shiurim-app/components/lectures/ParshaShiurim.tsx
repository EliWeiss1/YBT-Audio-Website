'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { FlatLecture } from '@/lib/lecture-utils'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { createClient } from '@/lib/supabase-browser'
import LectureCard from './LectureCard'
import MultiSelectFilter from './MultiSelectFilter'

const PAGE_SIZE = 15

type Section = { name: string; nodeId: string; lectures: FlatLecture[] }

/** The /parsha list. One section per parsha of the week (two on a double
 *  week); a segmented switch narrows to one of them. Newest first, rabbi
 *  filter limited to speakers who actually have a shiur on these parshiyot.
 *  Mirrors RecentlyGiven's paging and speaker-override handling. */
export default function ParshaShiurim({
  sections,
  userId,
}: {
  sections: Section[]
  userId?: string | null
}) {
  const [activeNode, setActiveNode] = useState<string>('all')
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [overrideMap, setOverrideMap] = useState<Record<string, string>>({})

  const pool = useMemo(() => {
    const picked = activeNode === 'all' ? sections : sections.filter(s => s.nodeId === activeNode)
    return picked
      .flatMap(s => s.lectures)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
  }, [sections, activeNode])

  useEffect(() => {
    const ids = sections.flatMap(s => s.lectures.map(l => l.id))
    if (ids.length === 0) return
    createClient()
      .from('speaker_overrides')
      .select('lecture_id, speaker')
      .in('lecture_id', ids)
      .then(({ data }) => {
        if (data) {
          setOverrideMap(
            Object.fromEntries(data.map((o: { lecture_id: string; speaker: string }) => [o.lecture_id, o.speaker])),
          )
        }
      })
  }, [sections])

  const effectiveSpeaker = (l: FlatLecture) => overrideMap[l.id] ?? normalizeRabbi(l.speaker)

  const rabbiOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const l of pool) {
      const s = effectiveSpeaker(l)
      if (s) counts.set(s, (counts.get(s) ?? 0) + 1)
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([s]) => s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool, overrideMap])

  const filtered = useMemo(
    () => pool.filter(l => selectedRabbis.length === 0 || selectedRabbis.includes(effectiveSpeaker(l))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pool, overrideMap, selectedRabbis],
  )

  const visible = filtered.slice(0, visibleCount)
  const hasMore = visibleCount < filtered.length
  const isDouble = sections.length > 1

  function pickSection(nodeId: string) {
    setActiveNode(nodeId)
    setSelectedRabbis([])
    setVisibleCount(PAGE_SIZE)
  }

  if (sections.every(s => s.lectures.length === 0)) {
    return (
      <p className="text-sm text-stone-400 py-4">
        No shiurim on this parsha yet.{' '}
        <Link href="/lectures" className="text-emerald-700 hover:text-emerald-800 font-medium">
          Browse all shiurim →
        </Link>
      </p>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {isDouble && (
          <div role="group" aria-label="Parsha" className="inline-flex rounded-lg border border-stone-200 p-0.5 bg-white">
            {[{ nodeId: 'all', label: 'Both' }, ...sections.map(s => ({ nodeId: s.nodeId, label: s.name }))].map(opt => {
              const on = activeNode === opt.nodeId
              return (
                <button
                  key={opt.nodeId}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickSection(opt.nodeId)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40
                    ${on ? 'bg-emerald-700 text-white' : 'text-stone-600 hover:bg-stone-100 active:bg-stone-200'}`}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
        )}
        <MultiSelectFilter
          emptyLabel="Rabbi"
          pluralNoun="rabbis"
          allLabel="All rabbis"
          options={rabbiOptions}
          selected={selectedRabbis}
          onChange={next => { setSelectedRabbis(next); setVisibleCount(PAGE_SIZE) }}
        />
        <span className="text-xs text-stone-400 ml-1">
          {filtered.length} {filtered.length === 1 ? 'shiur' : 'shiurim'}
        </span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-stone-400 py-4">No shiurim match these filters.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((lec, i) => (
            <LectureCard
              key={`${lec.nodeId}-${lec.id}`}
              lecture={lec}
              index={i + 1}
              speakerOverride={overrideMap[lec.id]}
              userId={userId}
            />
          ))}
        </div>
      )}

      {hasMore && (
        <button
          type="button"
          onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, filtered.length))}
          className="mt-4 text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
        >
          View More
        </button>
      )}
    </div>
  )
}
