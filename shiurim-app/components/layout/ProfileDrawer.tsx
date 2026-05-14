'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getLectureById } from '@/lib/lectures'
import type { User } from '@supabase/supabase-js'

type ProgressRow = {
  lecture_id: string
  position_seconds: number
  completed: boolean
  last_listened_at: string
}

type Stats = {
  completed: number
  inProgress: number
  totalHours: number
  streak: number
  topCategory: string | null
}

function computeStats(rows: ProgressRow[]): Stats {
  const completed  = rows.filter(r => r.completed).length
  const inProgress = rows.filter(r => !r.completed && r.position_seconds > 0).length
  const totalHours = rows.reduce((acc, r) => acc + (r.position_seconds ?? 0), 0) / 3600

  // Streak: consecutive calendar days with any listening activity
  const dates = Array.from(new Set(
    rows
      .filter(r => r.last_listened_at)
      .map(r => r.last_listened_at.slice(0, 10))
  )).sort().reverse()   // most recent first

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

  // Top category: resolve each lecture_id → breadcrumb[0] (root category label)
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

// ── Individual stat tile ─────────────────────────────────────────────────────
function StatTile({ value, label, icon }: { value: string; label: string; icon: string }) {
  return (
    <div className="bg-stone-50 rounded-xl p-4 flex flex-col gap-1">
      <span className="text-lg">{icon}</span>
      <span className="text-2xl font-bold text-stone-900 tabular-nums leading-none">{value}</span>
      <span className="text-xs text-stone-500">{label}</span>
    </div>
  )
}

// ── Main drawer ──────────────────────────────────────────────────────────────
export default function ProfileDrawer({
  user,
  onSignOut,
}: {
  user: User
  onSignOut: () => void
}) {
  const [open, setOpen]     = useState(false)
  const [stats, setStats]   = useState<Stats | null>(null)
  const [loading, setLoading] = useState(false)

  // Fetch progress whenever the drawer opens
  useEffect(() => {
    if (!open) return
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
  }, [open, user.id])

  const displayName = user.user_metadata?.full_name as string | undefined
  const initials = displayName
    ? displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
    : (user.email?.[0] ?? '?').toUpperCase()

  return (
    <>
      {/* ── Avatar trigger button ── */}
      <button
        onClick={() => setOpen(true)}
        className="w-8 h-8 rounded-full bg-emerald-700 text-white text-xs font-bold
                   flex items-center justify-center hover:bg-emerald-800 transition-colors shrink-0"
        aria-label="Open profile"
      >
        {initials}
      </button>

      {/* ── Backdrop ── */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={() => setOpen(false)}
        />
      )}

      {/* ── Drawer panel ── */}
      <div className={`
        fixed inset-y-0 right-0 z-50 w-80 bg-white shadow-xl flex flex-col
        transition-transform duration-300 ease-in-out
        ${open ? 'translate-x-0' : 'translate-x-full'}
      `}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <span className="font-semibold text-stone-800 text-sm">My Profile</span>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 rounded-lg text-stone-400 hover:bg-stone-100 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* User identity */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-stone-100">
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
                />
                <StatTile
                  icon="▶️"
                  value={String(stats.inProgress)}
                  label="In progress"
                />
                <StatTile
                  icon="🕐"
                  value={formatHours(stats.totalHours)}
                  label="Total listened"
                />
                <StatTile
                  icon="🔥"
                  value={String(stats.streak)}
                  label={stats.streak === 1 ? 'day streak' : 'day streak'}
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
        <div className="px-5 py-4 border-t border-stone-100">
          <button
            onClick={() => { setOpen(false); onSignOut() }}
            className="w-full py-2.5 rounded-lg text-sm font-medium text-stone-600
                       bg-stone-100 hover:bg-stone-200 transition-colors"
          >
            Sign out
          </button>
        </div>
      </div>
    </>
  )
}
