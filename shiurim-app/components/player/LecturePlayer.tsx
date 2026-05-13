'use client'

import { useEffect, useState } from 'react'
import { usePlayer, PLAYBACK_SPEEDS } from '@/lib/player-context'
import { getProgress } from '@/lib/supabase'
import { formatDuration, getLectureById } from '@/lib/lectures'

type Props = {
  lectureId: string
  userId?: string
}

export default function LecturePlayer({ lectureId, userId }: Props) {
  const { play, pause, resume, seek, skip, isPlaying, currentTime, duration, lecture, playbackSpeed, setSpeed } = usePlayer()
  const [resumePosition, setResumePosition] = useState<number | null>(null)
  const [completed, setCompleted] = useState(false)
  const [showSpeeds, setShowSpeeds] = useState(false)

  const isThisLecture = lecture?.id === lectureId
  const isThisPlaying = isThisLecture && isPlaying
  const displayTime = isThisLecture ? currentTime : (resumePosition ?? 0)
  const displayDuration = isThisLecture ? duration : 0
  const progress = displayDuration > 0 ? (displayTime / displayDuration) * 100 : 0

  useEffect(() => {
    if (!userId) return
    getProgress(userId, lectureId).then(p => {
      if (p) {
        setResumePosition(p.position_seconds)
        setCompleted(p.completed)
      }
    })
  }, [userId, lectureId])

  // Check if audio is available for this lecture
  const lectureInfo = getLectureById(lectureId)
  const hasAudio = !!(lectureInfo?.audioUrl)

  const handlePlay = () => {
    if (isThisLecture) {
      isPlaying ? pause() : resume()
    } else {
      play(lectureId, resumePosition ?? 0)
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isThisLecture) seek(Number(e.target.value))
  }

  return (
    <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 mb-6">

      {!hasAudio && (
        <div className="flex items-center gap-3 text-stone-400 py-2">
          <span className="text-2xl">🎵</span>
          <span className="text-sm">Audio not yet available for this shiur</span>
        </div>
      )}

      {hasAudio && (
        <>
      {/* Status badges */}
      {completed && (
        <div className="mb-4 flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 w-fit">
          ✅ You've completed this shiur
        </div>
      )}
      {!completed && resumePosition && resumePosition > 30 && !isThisLecture && (
        <div className="mb-4 flex items-center gap-2 text-sm text-amber-700 bg-amber-50 rounded-lg px-3 py-2 w-fit">
          ⏱ Will resume from {formatDuration(resumePosition)}
        </div>
      )}

      {/* Controls row */}
      <div className="flex items-center gap-4">

        {/* Back 15 */}
        <button
          onClick={() => skip(-15)}
          disabled={!isThisLecture}
          className="flex flex-col items-center text-stone-400 hover:text-stone-700 disabled:opacity-30 transition-colors"
          title="Back 15 seconds"
        >
          <span className="text-xl leading-none">⟨</span>
          <span className="text-[9px] leading-none mt-0.5">15</span>
        </button>

        {/* Play/Pause */}
        <button
          onClick={handlePlay}
          className="w-14 h-14 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white text-2xl
                     flex items-center justify-center transition-colors shadow-md shrink-0"
        >
          {isThisPlaying ? '⏸' : '▶'}
        </button>

        {/* Forward 30 */}
        <button
          onClick={() => skip(30)}
          disabled={!isThisLecture}
          className="flex flex-col items-center text-stone-400 hover:text-stone-700 disabled:opacity-30 transition-colors"
          title="Forward 30 seconds"
        >
          <span className="text-xl leading-none">⟩</span>
          <span className="text-[9px] leading-none mt-0.5">30</span>
        </button>

        {/* Progress bar */}
        <div className="flex-1 flex flex-col gap-1">
          <div
            className="relative h-2 bg-stone-100 rounded-full cursor-pointer group"
            onClick={(e) => {
              if (!isThisLecture || !displayDuration) return
              const rect = e.currentTarget.getBoundingClientRect()
              seek(Math.floor(((e.clientX - rect.left) / rect.width) * displayDuration))
            }}
          >
            <div
              className="absolute left-0 top-0 h-full bg-emerald-400 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
            <input
              type="range"
              min={0}
              max={displayDuration || 100}
              value={displayTime}
              onChange={handleSeek}
              disabled={!isThisLecture}
              className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-default"
            />
          </div>
          <div className="flex justify-between text-xs text-stone-400">
            <span>{formatDuration(displayTime)}</span>
            <span>{displayDuration > 0 ? formatDuration(displayDuration) : '--:--'}</span>
          </div>
        </div>

        {/* Speed control */}
        <div className="relative shrink-0">
          <button
            onClick={() => setShowSpeeds(s => !s)}
            className="px-3 py-1.5 rounded-lg border border-stone-200 hover:border-stone-300
                       hover:bg-stone-50 text-sm font-medium text-stone-600 transition-colors"
            title="Playback speed"
          >
            {playbackSpeed === 1 ? '1×' : `${playbackSpeed}×`}
          </button>
          {showSpeeds && (
            <div className="absolute bottom-full right-0 mb-2 bg-white border border-stone-200
                            rounded-xl shadow-lg overflow-hidden py-1 min-w-[90px] z-10">
              <div className="px-3 py-1 text-[10px] font-semibold text-stone-400 uppercase tracking-wide border-b border-stone-100 mb-1">
                Speed
              </div>
              {PLAYBACK_SPEEDS.map(speed => (
                <button
                  key={speed}
                  onClick={() => { setSpeed(speed); setShowSpeeds(false) }}
                  className={`w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center justify-between gap-2
                    ${playbackSpeed === speed
                      ? 'bg-emerald-50 text-emerald-800 font-semibold'
                      : 'text-stone-700 hover:bg-stone-50'}`}
                >
                  {speed === 1 ? '1× Normal' : `${speed}×`}
                  {playbackSpeed === speed && <span className="text-emerald-500 text-xs">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Keyboard hints */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-stone-300">
        <span><kbd className="font-mono bg-stone-100 px-1 rounded">Space</kbd> play/pause</span>
        <span><kbd className="font-mono bg-stone-100 px-1 rounded">←</kbd> −15s</span>
        <span><kbd className="font-mono bg-stone-100 px-1 rounded">→</kbd> +30s</span>
        <span><kbd className="font-mono bg-stone-100 px-1 rounded">[</kbd> <kbd className="font-mono bg-stone-100 px-1 rounded">]</kbd> speed</span>
        <span className="text-stone-200">· player stays active while you browse</span>
      </div>
      </>
    )}
  </div>
  )
}
