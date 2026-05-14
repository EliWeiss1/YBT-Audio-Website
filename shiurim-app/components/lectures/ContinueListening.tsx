'use client'

import { getLectureById, formatDuration } from '@/lib/lectures'
import { usePlayer } from '@/lib/player-context'

type ProgressRow = {
  lecture_id: string
  position_seconds: number
  completed: boolean
  last_listened_at: string
}

function formatTimeLeft(seconds: number): string {
  if (seconds <= 60) return '< 1 min left'
  const mins = Math.round(seconds / 60)
  return `${mins} min left`
}

export default function ContinueListening({ rows }: { rows: ProgressRow[] }) {
  const { play, pause, isPlaying, lecture: activeLecture } = usePlayer()

  // Resolve each row to a lecture object; skip any that no longer exist in the data
  const items = rows
    .map(row => ({ row, lecture: getLectureById(row.lecture_id) }))
    .filter((x): x is { row: ProgressRow; lecture: NonNullable<ReturnType<typeof getLectureById>> } =>
      x.lecture != null
    )

  if (items.length === 0) return null

  return (
    <section className="mb-10">
      <h2 className="text-sm font-semibold text-stone-500 uppercase tracking-wide mb-3">
        Continue Listening
      </h2>

      {/* Horizontal scroll strip */}
      <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1
                      [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        {items.map(({ row, lecture }) => {
          const isActive      = activeLecture?.id === lecture.id
          const isThisPlaying = isActive && isPlaying
          const pct = lecture.duration
            ? Math.min(100, Math.round((row.position_seconds / lecture.duration) * 100))
            : 0
          const secondsLeft = lecture.duration
            ? Math.max(0, lecture.duration - row.position_seconds)
            : 0

          // Build a short breadcrumb label (everything except the lecture title itself)
          const breadcrumb = lecture.breadcrumb.length > 1
            ? lecture.breadcrumb.slice(0, -1).join(' › ')
            : lecture.speaker

          return (
            <div
              key={lecture.id}
              className={`group relative flex flex-col justify-between shrink-0
                min-w-[175px] max-w-[175px] sm:min-w-[195px] sm:max-w-[195px]
                rounded-xl border p-4 cursor-pointer select-none transition-all
                hover:border-emerald-200 hover:shadow-sm
                ${isActive
                  ? 'border-emerald-300 bg-emerald-50/60'
                  : 'border-stone-200 bg-white'}`}
              onClick={() => isThisPlaying ? pause() : play(lecture.id, row.position_seconds)}
            >
              {/* Play / pause icon — top-right corner */}
              <div className={`absolute top-3 right-3 w-7 h-7 rounded-full shrink-0
                flex items-center justify-center text-xs transition-colors
                ${isActive
                  ? 'bg-emerald-700 text-white'
                  : 'bg-stone-100 text-stone-400 group-hover:bg-emerald-100 group-hover:text-emerald-700'}`}
              >
                {isThisPlaying ? '⏸' : '▶'}
              </div>

              {/* Title + breadcrumb */}
              <div className="pr-8 mb-3">
                <p className={`text-sm font-medium leading-snug line-clamp-2 mb-1
                  ${isActive ? 'text-emerald-800' : 'text-stone-800'}`}
                >
                  {lecture.title}
                </p>
                {breadcrumb && (
                  <p className="text-xs text-stone-400 truncate">{breadcrumb}</p>
                )}
              </div>

              {/* Progress bar + labels */}
              <div>
                <div className="h-1 w-full bg-stone-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-400 rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1.5">
                  <span className="text-xs text-stone-400">{formatTimeLeft(secondsLeft)}</span>
                  {lecture.duration ? (
                    <span className="text-xs text-stone-300 tabular-nums">
                      {formatDuration(lecture.duration)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
