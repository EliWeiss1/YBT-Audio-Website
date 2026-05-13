'use client'

import Link from 'next/link'
import { FlatLecture, Lecture, formatDuration } from '@/lib/lectures'
import { usePlayer } from '@/lib/player-context'

type Props = {
  lecture: Lecture | FlatLecture
  index: number
  progress?: { position_seconds: number; completed: boolean } | null
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
    ? Math.round((progress.position_seconds / lecture.duration) * 100)
    : 0

  // Subtitle: breadcrumb if available, otherwise speaker
  const subtitle = 'breadcrumb' in lecture && lecture.breadcrumb.length > 1
    ? lecture.breadcrumb.slice(1).join(' › ')
    : lecture.speaker

  return (
    <div className={`group flex items-center gap-4 p-4 rounded-xl border transition-all
      hover:border-emerald-200 hover:bg-emerald-50/30
      ${isActive ? 'border-emerald-200 bg-emerald-50/50' : 'border-stone-100 bg-white'}`}
    >
      {/* Index / play button */}
      <div className="w-8 text-center shrink-0">
        <span className={`text-sm text-stone-400 group-hover:hidden ${isActive ? 'hidden' : 'block'}`}>
          {index}
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
        <div className={`text-sm font-medium truncate ${isActive ? 'text-emerald-800' : 'text-stone-800'}`}>
          {lecture.title}
        </div>
        {subtitle && (
          <div className="text-xs text-stone-400 mt-0.5 truncate">{subtitle}</div>
        )}
        {progress && !progress.completed && progressPct > 0 && (
          <div className="mt-1.5 h-1 w-24 bg-stone-200 rounded-full overflow-hidden">
            <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
        )}
      </Link>

      {/* Right: duration + completion */}
      <div className="flex items-center gap-3 shrink-0">
        {progress?.completed && (
          <span className="text-emerald-500 text-sm" title="Completed">✓</span>
        )}
        <span className="text-xs text-stone-400 tabular-nums">
          {lecture.duration ? formatDuration(lecture.duration) : ''}
        </span>
      </div>
    </div>
  )
}