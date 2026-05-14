'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { getLectureById, formatDuration } from '@/lib/lectures'
import { usePlayer } from '@/lib/player-context'
import { createClient } from '@/lib/supabase-browser'
import { deleteProgress } from '@/lib/supabase'

type ProgressRow = {
  lecture_id: string
  position_seconds: number
  completed: boolean
  last_listened_at: string
  duration_seconds?: number | null
}

type Filter = 'in-progress' | 'completed'

function formatTimeLeft(seconds: number): string {
  if (seconds <= 60) return '< 1 min left'
  return `${Math.round(seconds / 60)} min left`
}

function formatMinutesIn(seconds: number): string {
  const mins = Math.round(seconds / 60)
  return mins < 1 ? 'Just started' : `${mins} min in`
}

// ── Shared progress bar calculation ─────────────────────────────────────────
function getProgressMetrics(row: ProgressRow, lectureDuration: number) {
  const effectiveDuration = lectureDuration > 0 ? lectureDuration : (row.duration_seconds ?? 0)
  const pct = effectiveDuration
    ? Math.min(100, Math.round((row.position_seconds / effectiveDuration) * 100))
    : 0
  const secondsLeft = effectiveDuration
    ? Math.max(0, effectiveDuration - row.position_seconds)
    : 0
  return { effectiveDuration, pct, secondsLeft }
}

// ── History modal ────────────────────────────────────────────────────────────
function HistoryModal({
  userId,
  onClose,
  onDelete,
}: {
  userId: string
  onClose: () => void
  onDelete: (lectureId: string) => void
}) {
  const [allRows, setAllRows]   = useState<ProgressRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<Filter>('in-progress')
  const [deleting, setDeleting] = useState<string | null>(null)
  const { play, pause, isPlaying, lecture: activeLecture } = usePlayer()

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('progress')
      .select('lecture_id, position_seconds, completed, duration_seconds, last_listened_at')
      .eq('user_id', userId)
      .gt('position_seconds', 0)
      .order('last_listened_at', { ascending: false })
      .then(({ data }) => {
        setAllRows((data ?? []) as ProgressRow[])
        setLoading(false)
      })
  }, [userId])

  const handleDelete = useCallback(async (lectureId: string) => {
    setDeleting(lectureId)
    await deleteProgress(userId, lectureId)
    setAllRows(prev => prev.filter(r => r.lecture_id !== lectureId))
    onDelete(lectureId)
    setDeleting(null)
  }, [userId, onDelete])

  const inProgressRows = allRows.filter(r => !r.completed && r.position_seconds > 0)
  const completedRows  = allRows.filter(r => r.completed)
  const displayed      = filter === 'in-progress' ? inProgressRows : completedRows

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed inset-x-4 top-[10%] bottom-[10%] z-50 max-w-xl mx-auto
                      bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
          <h2 className="font-semibold text-stone-800">Listening History</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-5 pt-3 pb-2 shrink-0">
          {(['in-progress', 'completed'] as Filter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                ${filter === f
                  ? 'bg-emerald-700 text-white'
                  : 'bg-stone-100 text-stone-500 hover:bg-stone-200'}`}
            >
              {f === 'in-progress' ? 'In Progress' : 'Completed'}
              <span className="ml-1.5 opacity-70">
                {f === 'in-progress' ? inProgressRows.length : completedRows.length}
              </span>
            </button>
          ))}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-2 space-y-2">
          {loading && (
            <div className="flex items-center justify-center py-12 text-stone-300 text-sm">
              Loading…
            </div>
          )}

          {!loading && displayed.length === 0 && (
            <div className="flex items-center justify-center py-12 text-stone-400 text-sm">
              {filter === 'in-progress' ? 'No shiurim in progress.' : 'No completed shiurim yet.'}
            </div>
          )}

          {!loading && displayed.map(row => {
            const lecture = getLectureById(row.lecture_id)
            if (!lecture) return null
            const isActive      = activeLecture?.id === lecture.id
            const isThisPlaying = isActive && isPlaying
            const { effectiveDuration, pct, secondsLeft } = getProgressMetrics(row, lecture.duration)
            const breadcrumb = lecture.breadcrumb.length > 1
              ? lecture.breadcrumb.slice(0, -1).join(' › ')
              : lecture.speaker

            return (
              <div
                key={row.lecture_id}
                className={`group rounded-xl border p-4 transition-all
                  ${isActive
                    ? 'border-emerald-300 bg-emerald-50/50'
                    : row.completed
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-stone-100 bg-white'}`}
              >
                <div className="flex items-start gap-3">
                  {/* Play/pause button */}
                  <button
                    onClick={() => isThisPlaying ? pause() : play(lecture.id, row.position_seconds)}
                    className={`mt-0.5 w-7 h-7 rounded-full shrink-0 flex items-center justify-center
                      text-xs transition-colors
                      ${isActive
                        ? 'bg-emerald-700 text-white'
                        : 'bg-stone-100 text-stone-400 hover:bg-emerald-100 hover:text-emerald-700'}`}
                  >
                    {isThisPlaying ? '⏸' : '▶'}
                  </button>

                  {/* Title + breadcrumb + progress */}
                  <Link
                    href={`/lectures/${encodeURIComponent(lecture.id)}`}
                    onClick={onClose}
                    className="flex-1 min-w-0"
                  >
                    <p className={`text-sm font-medium leading-snug truncate
                      ${isActive ? 'text-emerald-800' : row.completed ? 'text-stone-500' : 'text-stone-800'}`}
                    >
                      {lecture.title}
                    </p>
                    {breadcrumb && (
                      <p className="text-xs text-stone-400 truncate mt-0.5">{breadcrumb}</p>
                    )}

                    {/* Progress display */}
                    {row.completed ? (
                      <p className="text-xs text-emerald-600 mt-1.5 font-medium">
                        ✓ Completed
                        {effectiveDuration > 0 && (
                          <span className="text-stone-400 font-normal ml-1.5">
                            · {formatDuration(effectiveDuration)}
                          </span>
                        )}
                      </p>
                    ) : effectiveDuration > 0 ? (
                      <div className="mt-2">
                        <div className="h-1 w-full bg-stone-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-400 rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-xs text-stone-400 mt-0.5">{formatTimeLeft(secondsLeft)}</p>
                      </div>
                    ) : (
                      <p className="text-xs text-stone-400 mt-1.5">
                        {formatMinutesIn(row.position_seconds)}
                      </p>
                    )}
                  </Link>

                  {/* Delete button */}
                  <button
                    onClick={() => handleDelete(row.lecture_id)}
                    disabled={deleting === row.lecture_id}
                    className="shrink-0 p-1.5 rounded-lg text-stone-300 hover:text-red-400
                               hover:bg-red-50 transition-colors disabled:opacity-40"
                    title="Remove from history"
                  >
                    {deleting === row.lecture_id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

// ── Main strip component ─────────────────────────────────────────────────────
export default function ContinueListening({
  rows: initialRows,
  userId,
}: {
  rows: ProgressRow[]
  userId: string
}) {
  const { play, pause, isPlaying, lecture: activeLecture } = usePlayer()
  // Keep strip rows in state so deletes reflect immediately without a page reload
  const [stripRows, setStripRows] = useState(initialRows)
  const [modalOpen, setModalOpen] = useState(false)

  const handleDelete = useCallback((lectureId: string) => {
    setStripRows(prev => prev.filter(r => r.lecture_id !== lectureId))
  }, [])

  const items = stripRows
    .map(row => ({ row, lecture: getLectureById(row.lecture_id) }))
    .filter((x): x is { row: ProgressRow; lecture: NonNullable<ReturnType<typeof getLectureById>> } =>
      x.lecture != null
    )

  if (items.length === 0 && !modalOpen) return null

  return (
    <>
      <section className="mb-10">
        {/* Clickable header */}
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-1.5 mb-3 group"
        >
          <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide
                         group-hover:text-emerald-700 transition-colors">
            Continue Listening
          </h2>
          <svg className="w-3.5 h-3.5 text-stone-400 group-hover:text-emerald-600 transition-colors"
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </button>

        {/* Horizontal scroll strip */}
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1
                        [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
          {items.map(({ row, lecture }) => {
            const isActive      = activeLecture?.id === lecture.id
            const isThisPlaying = isActive && isPlaying
            const { effectiveDuration, pct, secondsLeft } = getProgressMetrics(row, lecture.duration)
            const breadcrumb = lecture.breadcrumb.length > 1
              ? lecture.breadcrumb.slice(0, -1).join(' › ')
              : lecture.speaker

            return (
              <Link
                key={lecture.id}
                href={`/lectures/${encodeURIComponent(lecture.id)}`}
                className={`group relative flex flex-col justify-between shrink-0
                  min-w-[175px] max-w-[175px] sm:min-w-[195px] sm:max-w-[195px]
                  rounded-xl border p-4 select-none transition-all
                  hover:border-emerald-200 hover:shadow-sm
                  ${isActive ? 'border-emerald-300 bg-emerald-50/60' : 'border-stone-200 bg-white'}`}
              >
                {/* Play/pause */}
                <button
                  onClick={e => {
                    e.preventDefault()
                    e.stopPropagation()
                    isThisPlaying ? pause() : play(lecture.id, row.position_seconds)
                  }}
                  className={`absolute top-3 right-3 w-7 h-7 rounded-full shrink-0
                    flex items-center justify-center text-xs transition-colors
                    ${isActive
                      ? 'bg-emerald-700 text-white'
                      : 'bg-stone-100 text-stone-400 group-hover:bg-emerald-100 group-hover:text-emerald-700'}`}
                >
                  {isThisPlaying ? '⏸' : '▶'}
                </button>

                {/* Title + breadcrumb */}
                <div className="pr-8 mb-3">
                  <p className={`text-sm font-medium leading-snug line-clamp-2 mb-1
                    ${isActive ? 'text-emerald-800' : 'text-stone-800'}`}>
                    {lecture.title}
                  </p>
                  {breadcrumb && (
                    <p className="text-xs text-stone-400 truncate">{breadcrumb}</p>
                  )}
                </div>

                {/* Progress */}
                <div>
                  {effectiveDuration > 0 ? (
                    <>
                      <div className="h-1 w-full bg-stone-200 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between mt-1.5">
                        <span className="text-xs text-stone-400">{formatTimeLeft(secondsLeft)}</span>
                        <span className="text-xs text-stone-300 tabular-nums">
                          {formatDuration(effectiveDuration)}
                        </span>
                      </div>
                    </>
                  ) : (
                    <div className="text-xs text-stone-400">{formatMinutesIn(row.position_seconds)}</div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      </section>

      {modalOpen && (
        <HistoryModal
          userId={userId}
          onClose={() => setModalOpen(false)}
          onDelete={handleDelete}
        />
      )}
    </>
  )
}
