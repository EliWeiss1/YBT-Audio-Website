'use client'

import Link from 'next/link'
import { FlatLecture, Lecture, formatDuration } from '@/lib/lectures'
import { usePlayer } from '@/lib/player-context'
import BookmarkButton from './BookmarkButton'

type Props = {
  lecture: Lecture | FlatLecture
  index: number
  progress?: { position_seconds: number; completed: boolean; duration_seconds?: number | null } | null
  speakerOverride?: string
  userId?: string | null
  saved?: boolean
}

function formatTimeLeft(seconds: number): string {
  if (seconds <= 60) return '< 1 min left'
  const mins = Math.round(seconds / 60)
  return `${mins} min left`
}

function formatMinutesIn(seconds: number): string {
  const mins = Math.round(seconds / 60)
  if (mins < 1) return 'Started'
  return `${mins} min in`
}

export default function LectureCard({ lecture, index, progress, speakerOverride, userId, saved }: Props) {
  const { play, pause, isPlaying, lecture: activeLecture } = usePlayer()

  const isActive = activeLecture?.id === lecture.id
  const isThisPlaying = isActive && isPlaying

  const handlePlay = (e: React.MouseEvent) => {
    e.preventDefault()
    if (isThisPlaying) pause()
    else play(lecture.id, progress?.position_seconds ?? 0)
  }

  // Use stored duration from progress row as fallback when JSON duration is 0
  const effectiveDuration = lecture.duration > 0
    ? lecture.duration
    : (progress?.duration_seconds ?? 0)

  const progressPct = progress && effectiveDuration
    ? Math.min(100, Math.round((progress.position_seconds / effectiveDuration) * 100))
    : 0

  const secondsLeft = progress && effectiveDuration
    ? Math.max(0, effectiveDuration - progress.position_seconds)
    : 0

  // isInProgress: has started but not finished — independent of whether we know the duration
  const isInProgress = !!progress && !progress.completed && progress.position_seconds > 0
  const isCompleted  = !!progress?.completed
  const hasBarData   = isInProgress && effectiveDuration > 0 && progressPct > 0

  // Subtitle: breadcrumb if available, otherwise speaker (prefer override)
  const effectiveSpeaker = speakerOverride ?? lecture.speaker
  const subtitle = 'breadcrumb' in lecture && lecture.breadcrumb.length > 1
    ? lecture.breadcrumb.slice(1).join(' › ')
    : effectiveSpeaker

  return (
    <div className={`group flex items-start gap-4 p-4 rounded-xl border transition-all
      hover:border-emerald-200 hover:bg-emerald-50/30
      ${isActive
        ? 'border-emerald-300 bg-emerald-50/50'
        : isCompleted
          ? 'border-emerald-200 bg-emerald-50/40'
          : 'border-stone-100 bg-white'}`}
    >
      {/* Index / play button */}
      <div className="w-8 text-center shrink-0 mt-0.5">
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
        <div className={`text-sm font-medium
          ${isActive ? 'text-emerald-800' : isCompleted ? 'text-stone-500' : 'text-stone-800'}`}
        >
          {lecture.title}
        </div>
        {subtitle && (
          <div className="text-xs text-stone-400 mt-0.5">{subtitle}</div>
        )}

        {isInProgress && (
          <div className="mt-2">
            {hasBarData ? (
              <>
                <div className="h-1 w-full bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <div className="text-xs text-stone-400 mt-0.5">{formatTimeLeft(secondsLeft)}</div>
              </>
            ) : (
              <div className="text-xs text-emerald-600/70">{formatMinutesIn(progress!.position_seconds)}</div>
            )}
          </div>
        )}
      </Link>

      {/* Right: bookmark + duration + download */}
      <div className="shrink-0 flex flex-col items-end gap-1">
        <div className="flex items-center gap-0.5">
          <BookmarkButton
            lectureId={lecture.id}
            userId={userId}
            initialSaved={saved}
            size="sm"
          />
          <span className="text-xs text-stone-400 tabular-nums">
            {lecture.duration ? formatDuration(lecture.duration) : ''}
          </span>
        </div>
        {'audioUrl' in lecture && lecture.audioUrl && (
          <a
            href={`/api/download/${encodeURIComponent(lecture.id)}`}
            onClick={e => e.stopPropagation()}
            className="opacity-0 group-hover:opacity-100 transition-opacity
                       flex items-center gap-1 text-[10px] text-stone-400 hover:text-emerald-600"
            title="Download MP3"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor"
                 className="w-3 h-3">
              <path d="M8 1a.75.75 0 0 1 .75.75v6.69l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.53a.75.75 0 0 1 1.06-1.06L7.25 8.44V1.75A.75.75 0 0 1 8 1ZM2.5 13.25a.75.75 0 0 1 .75-.75h9.5a.75.75 0 0 1 0 1.5h-9.5a.75.75 0 0 1-.75-.75Z" />
            </svg>
            DL
          </a>
        )}
      </div>
    </div>
  )
}
