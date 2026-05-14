'use client'

import Link from 'next/link'
import { FlatLecture, Lecture, formatDuration } from '@/lib/lectures'
import { usePlayer } from '@/lib/player-context'

type Props = {
  lecture: Lecture | FlatLecture
  index: number
  progress?: { position_seconds: number; completed: boolean } | null
}

function formatTimeLeft(seconds: number): string {
  if (seconds <= 60) return '< 1 min left'
  const mins = Math.round(seconds / 60)
  return `${mins} min left`
}

export default function LectureCard({ lecture, index, progress }: Props) {
  const { play, pause, isPlaying, lecture: activeLecture } = usePlayer()

  const isActive = activeLecture?.id === lecture.id
  const isThisPlaying = isActive && isPlaying

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isThisPlaying) pause()
    else play(lecture.id, progress?.position_seconds ?? 0)
  }

  const progressPct = progress && lecture.duration
    ? Math.min(100, Math.round((progress.position_seconds / lecture.duration) * 100))
    : 0

  const isInProgress = !!progress && !progress.completed && progressPct > 0
  const isCompleted  = !!progress?.completed

  const secondsLeft = isInProgress && lecture.duration
    ? Math.max(0, lecture.duration - progress!.position_seconds)
    : 0

  // Subtitle: breadcrumb if available, otherwise speaker
  const subtitle = 'breadcrumb' in lecture && lecture.breadcrumb.length > 1
    ? lecture.breadcrumb.slice(1).join(' › ')
    : lecture.speaker

  return (
    <div className={`group flex items-center gap-4 p-4 rounded-xl border transition-all
      hover:border-emerald-200 hover:bg-emerald-50/30
      ${isActive
        ? 'border-emerald-300 bg-emerald-50/50'
        : isCompleted
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-stone-100 bg-white'}`}
    >
      {/* Index / play button */}
      <div className="w-8 text-center shrink-0">
        <span className={`text-sm group-hover:hidden
          ${isActive ? 'hidden' : 'block'}
          ${isCompleted ? 'text-emerald-400' : 'text-stone-400'}`}
        >
          {isCompleted ? '✓' : index}
        </span>
        <button
          onClick={handlePlay}
          className={`w-8 h-8 rounded-full flex items-center justify-center text-sm transition-colors
            ${isActive
              ? 'flex bg-emerald-700 text-white'
              : 'hidden group-hover:flex bg-emerald-100 text-emerald-700 hover:bg-emerald-200'}`}
        >
          {isThisPlaying ? '⏸' : '▶'}
        </button>
      </div>

      {/* Title + meta */}
      <Link href={`/lectures/${encodeURIComponent(lecture.id)}`} className="flex-1 min-w-0">
        <div className={`text-sm font-medium truncate
          ${isActive ? 'text-emerald-800' : isCompleted ? 'text-stone-500' : 'text-stone-800'}`}
        >
          {lecture.title}
        </div>
        {subtitle && (
          <div className="text-xs text-stone-400 mt-0.5 truncate">{subtitle}</div>
        )}
        {isInProgress && (
          <div className="mt-2">
            <div className="h-1 w-full bg-stone-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 rounded-full transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {secondsLeft > 0 && (
              <div className="text-xs text-stone-400 mt-0.5">{formatTimeLeft(secondsLeft)}</div>
            )}
          </div>
        )}
      </Link>

      {/* Right: duration */}
      <div className="shrink-0">
        <span className="text-xs text-stone-400 tabular-nums">
          {lecture.duration ? formatDuration(lecture.duration) : ''}
        </span>
      </div>
    </div>
  )
}