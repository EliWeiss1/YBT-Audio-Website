'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { getLectureById, formatDuration } from '@/lib/lectures'
import { usePlayer } from '@/lib/player-context'
import { deleteProgress } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

// ── Types ────────────────────────────────────────────────────────────────────

type ProgressRow = {
  lecture_id: string
  position_seconds: number
  completed: boolean
  last_listened_at: string
  duration_seconds?: number | null
}

type Stats = {
  completed: number
  inProgress: number
  totalHours: number
  streak: number
  topCategory: string | null
}

type DrawerView = 'main' | 'inProgress'
type ProgressFilter = 'in-progress' | 'completed'

// ── Stats helpers ─────────────────────────────────────────────────────────────

function computeStats(rows: ProgressRow[]): Stats {
  const completed  = rows.filter(r => r.completed).length
  const inProgress = rows.filter(r => !r.completed && r.position_seconds > 0).length
  const totalHours = rows.reduce((acc, r) => acc + (r.position_seconds ?? 0), 0) / 3600

  const dates = Array.from(new Set(
    rows
      .filter(r => r.last_listened_at)
      .map(r => r.last_listened_at.slice(0, 10))
  )).sort().reverse()

  let streak = 0
  if (dates.length > 0) {
    const today     = new Date().toISOString().slice(0, 10)
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)
    if (dates[0] === today || dates[0] === yesterday) {
      streak = 1
      for (let i = 1; i < dates.length; i++) {
        const prev = new Date(dates[i - 1]).getTime()
        const curr = new Date(dates[i]).getTime()
        if ((prev - curr) / 86_400_000 === 1) streak++
        else break
      }
    }
  }

  const catCounts: Record<string, number> = {}
  for (const row of rows) {
    const lec = getLectureById(row.lecture_id)
    if (!lec || !('breadcrumb' in lec) || lec.breadcrumb.length === 0) continue
    const cat = lec.breadcrumb[0]
    catCounts[cat] = (catCounts[cat] ?? 0) + 1
  }
  const topCategory = Object.entries(catCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  return { completed, inProgress, totalHours, streak, topCategory }
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`
  return `${h.toFixed(1).replace(/\.0$/, '')}h`
}

function formatTimeLeft(seconds: number): string {
  if (seconds <= 60) return '< 1 min left'
  return `${Math.round(seconds / 60)} min left`
}

function formatMinutesIn(seconds: number): string {
  const mins = Math.round(seconds / 60)
  return mins < 1 ? 'Just started' : `${mins} min in`
}

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

// ── Stat tile ─────────────────────────────────────────────────────────────────

function StatTile({
  value,
  label,
  icon,
  onClick,
  clickable,
}: {
  value: string
  label: string
  icon: string
  onClick?: () => void
  clickable?: boolean
}) {
  const base = 'bg-stone-50 rounded-xl p-4 flex flex-col gap-1 transition-colors'
  if (clickable && onClick) {
    return (
      <button
        onClick={onClick}
        className={`${base} hover:bg-emerald-50 hover:ring-1 hover:ring-emerald-200 text-left w-full group`}
      >
        <span className="text-lg">{icon}</span>
        <span className="text-2xl font-bold text-stone-900 tabular-nums leading-none group-hover:text-emerald-800">
          {value}
        </span>
        <div className="flex items-center gap-1">
          <span className="text-xs text-stone-500 group-hover:text-emerald-600">{label}</span>
          <svg className="w-3 h-3 text-stone-300 group-hover:text-emerald-500 transition-colors"
            fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
        </div>
      </button>
    )
  }
  return (
    <div className={base}>
      <span className="text-lg">{icon}</span>
      <span className="text-2xl font-bold text-stone-900 tabular-nums leading-none">{value}</span>
      <span className="text-xs text-stone-500">{label}</span>
    </div>
  )
}

// ── In-Progress view (renders inside the drawer) ──────────────────────────────

function InProgressView({
  userId,
  onBack,
  onClose,
}: {
  userId: string
  onBack: () => void
  onClose: () => void
}) {
  const [allRows, setAllRows]   = useState<ProgressRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<ProgressFilter>('in-progress')
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
    setDeleting(null)
  }, [userId])

  const inProgressRows = allRows.filter(r => !r.completed && r.position_seconds > 0)
  const completedRows  = allRows.filter(r => r.completed)
  const displayed      = filter === 'in-progress' ? inProgressRows : completedRows

  return (
    <>
      {/* Sub-header */}
      <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100 shrink-0">
        <button
          onClick={onBack}
          className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 hover:text-stone-700
                     transition-colors -ml-1.5"
          aria-label="Back to profile"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-sm font-semibold text-stone-800">Listening History</span>
      </div>

      {/* Filter pills */}
      <div className="flex gap-1.5 px-5 pt-3 pb-2 shrink-0">
        {(['in-progress', 'completed'] as ProgressFilter[]).map(f => (
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
          <div className="flex items-center justify-center py-12 text-stone-300 text-sm">Loading…</div>
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
              className={`rounded-xl border p-3 transition-all
                ${isActive
                  ? 'border-emerald-300 bg-emerald-50/50'
                  : row.completed
                    ? 'border-emerald-200 bg-emerald-50/40'
                    : 'border-stone-100 bg-white'}`}
            >
              <div className="flex items-start gap-2.5">
                {/* Play/pause */}
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

                {/* Title + progress */}
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
                        <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">{formatTimeLeft(secondsLeft)}</p>
                    </div>
                  ) : (
                    <p className="text-xs text-stone-400 mt-1.5">{formatMinutesIn(row.position_seconds)}</p>
                  )}
                </Link>

                {/* Delete */}
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
    </>
  )
}

// ── Main drawer ───────────────────────────────────────────────────────────────

export default function ProfileDrawer({
  user,
  onSignOut,
}: {
  user: User
  onSignOut: () => void
}) {
  const [open, setOpen]       = useState(false)
  const [view, setView]       = useState<DrawerView>('main')
  const [stats, setStats]     = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch progress whenever the drawer opens (or returns to main)
  useEffect(() => {
    if (!open || view !== 'main') return
    setLoading(true)
    const supabase = createClient()
    supabase
      .from('progress')
      .select('lecture_id, position_seconds, completed, last_listened_at')
      .eq('user_id', user.id)
      .then(({ data }) => {
        setStats(computeStats((data ?? []) as ProgressRow[]))
        setLoading(false)
      })
  }, [open, view, user.id])

  // Reset to main view when drawer closes
  const handleClose = () => {
    setOpen(false)
    // Small delay so the slide-out animation finishes before resetting view
    setTimeout(() => setView('main'), 300)
  }

  const displayName = user.user_metadata?.full_name as string | undefined
  const initials = displayName
    ? displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : (user.email?.[0] ?? '?').toUpperCase()

  return (
    <>
      {/* Avatar trigger */}
      <button
        onClick={() => setOpen(true)}
        className="w-8 h-8 rounded-full bg-emerald-700 text-white text-xs font-bold
                   flex items-center justify-center hover:bg-emerald-800 transition-colors shrink-0"
        aria-label="Open profile"
      >
        {initials}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={handleClose}
        />
      )}

      {/* Drawer panel */}
      <div className={`
        fixed inset-y-0 right-0 z-50 w-80 bg-white shadow-xl flex flex-col
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full'}
      `}>

        {/* ── Top bar (always visible) ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 shrink-0">
          <span className="font-semibold text-stone-800 text-sm">
            {view === 'main' ? 'My Profile' : ''}
          </span>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── MAIN VIEW ── */}
        {view === 'main' && (
          <>
            {/* User identity */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-100 shrink-0">
              <div className="w-10 h-10 rounded-full bg-emerald-700 text-white text-sm font-bold
                              flex items-center justify-center shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                {displayName && (
                  <p className="text-sm font-medium text-stone-900 truncate">{displayName}</p>
                )}
                <p className="text-xs text-stone-400 truncate">{user.email}</p>
              </div>
            </div>

            {/* Stats */}
            <div className="flex-1 overflow-y-auto px-5 py-5">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">
                Listening Stats
              </p>

              {loading && (
                <div className="flex items-center justify-center py-10 text-stone-300 text-sm">
                  Loading…
                </div>
              )}

              {!loading && stats && (
                <>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <StatTile
                      icon="✅"
                      value={String(stats.completed)}
                      label="Completed"
                      clickable={stats.completed > 0}
                      onClick={() => setView('inProgress')}
                    />
                    <StatTile
                      icon="▶️"
                      value={String(stats.inProgress)}
                      label="In progress"
                      clickable={stats.inProgress > 0}
                      onClick={() => setView('inProgress')}
                    />
                    <StatTile
                      icon="🕐"
                      value={formatHours(stats.totalHours)}
                      label="Total listened"
                    />
                    <StatTile
                      icon="🔥"
                      value={String(stats.streak)}
                      label="day streak"
                    />
                  </div>

                  {stats.topCategory && (
                    <div className="bg-stone-50 rounded-xl px-4 py-3 flex items-center gap-3">
                      <span className="text-lg">📚</span>
                      <div>
                        <p className="text-xs text-stone-400">Top category</p>
                        <p className="text-sm font-medium text-stone-800">{stats.topCategory}</p>
                      </div>
                    </div>
                  )}

                  {stats.completed === 0 && stats.inProgress === 0 && (
                    <p className="text-xs text-stone-400 text-center py-4">
                      Start listening to see your stats here.
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Sign out */}
            <div className="px-5 py-4 border-t border-stone-100 shrink-0">
              <button
                onClick={() => { handleClose(); onSignOut() }}
                className="w-full py-2.5 rounded-lg text-sm font-medium text-stone-600
                           bg-stone-100 hover:bg-stone-200 transition-colors"
              >
                Sign out
              </button>
            </div>
          </>
        )}

        {/* ── IN-PROGRESS VIEW ── */}
        {view === 'inProgress' && (
          <InProgressView
            userId={user.id}
            onBack={() => setView('main')}
            onClose={handleClose}
          />
        )}
      </div>
    </>
  )
}
