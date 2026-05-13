'use client'

import { useState } from 'react'
import { usePlayer, PLAYBACK_SPEEDS } from '@/lib/player-context'
import { formatDuration } from '@/lib/lectures'
import Link from 'next/link'

export default function BottomPlayer() {
  const { lecture, isPlaying, currentTime, duration, pause, resume, seek, skip, playbackSpeed, setSpeed } = usePlayer()
  const [showSpeeds, setShowSpeeds] = useState(false)

  if (!lecture) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0
  const subtitle = lecture.breadcrumb.length > 1
    ? lecture.breadcrumb.slice(1).join(' › ')
    : lecture.speaker

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-stone-200 shadow-lg">
      <div className="flex items-center gap-2 sm:gap-4 px-3 sm:px-6 py-3 max-w-screen-xl mx-auto">

        {/* Lecture info — narrower on mobile, exact w-48 on desktop */}
        <div className="w-28 sm:w-48 shrink-0 min-w-0">
          <Link href={`/lectures/${encodeURIComponent(lecture.id)}`}
            className="text-sm font-semibold text-stone-900 truncate block hover:text-emerald-700 transition-colors">
            {lecture.title}
          </Link>
          <div className="text-xs text-stone-400 truncate hidden sm:block">{subtitle}</div>
        </div>

        {/* Center controls — identical to original on desktop */}
        <div className="flex-1 flex flex-col items-center gap-1.5">
          <div className="flex items-center gap-3">
            <button onClick={() => skip(-15)} title="Back 15s (←)"
              className="flex flex-col items-center text-stone-500 hover:text-stone-800 transition-colors">
              <span className="text-lg leading-none">⟨</span>
              <span className="text-[9px] leading-none mt-0.5">15</span>
            </button>
            <button
              onClick={isPlaying ? pause : resume}
              className="w-11 h-11 rounded-full bg-emerald-700 text-white flex items-center justify-center
                         hover:bg-emerald-800 transition-colors shadow-md text-lg"
              title="Play/Pause (Space)"
            >
              {isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => skip(30)} title="Forward 30s (→)"
              className="flex flex-col items-center text-stone-500 hover:text-stone-800 transition-colors">
              <span className="text-lg leading-none">⟩</span>
              <span className="text-[9px] leading-none mt-0.5">30</span>
            </button>
          </div>

          {/* Progress bar */}
          <div className="flex items-center gap-3 w-full max-w-xl">
            <span className="text-xs text-stone-400 tabular-nums w-10 text-right shrink-0">
              {formatDuration(currentTime)}
            </span>
            <div className="relative flex-1 h-1 bg-stone-200 rounded-full cursor-pointer"
              onClick={e => {
                const rect = e.currentTarget.getBoundingClientRect()
                seek(Math.floor(((e.clientX - rect.left) / rect.width) * duration))
              }}>
              <div className="absolute left-0 top-0 h-full bg-emerald-500 rounded-full"
                style={{ width: `${progress}%` }} />
              <input type="range" min={0} max={duration || 100} value={currentTime}
                onChange={e => seek(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer" />
            </div>
            <span className="text-xs text-stone-400 tabular-nums w-10 shrink-0">
              {formatDuration(duration)}
            </span>
          </div>
        </div>

        {/* Speed control — exact original on desktop, auto-width on mobile */}
        <div className="w-auto sm:w-24 shrink-0 sm:flex sm:justify-end">
          <div className="relative">
            <button
              onClick={() => setShowSpeeds(s => !s)}
              className="flex items-center gap-1 px-2 sm:px-3 py-1.5 rounded-lg border border-stone-200
                         hover:border-stone-300 hover:bg-stone-50 transition-colors text-sm font-medium text-stone-700"
              title="Speed ([ / ])"
            >
              {playbackSpeed === 1 ? '1×' : `${playbackSpeed}×`}
              <span className="text-stone-400 text-xs">▾</span>
            </button>
            {showSpeeds && (
              <div className="absolute bottom-full right-0 mb-2 bg-white border border-stone-200 rounded-xl
                              shadow-lg overflow-hidden py-1 min-w-[80px]">
                <div className="px-3 py-1.5 text-[10px] font-semibold text-stone-400 uppercase tracking-wide border-b border-stone-100 mb-1">
                  Speed
                </div>
                {PLAYBACK_SPEEDS.map(speed => (
                  <button key={speed} onClick={() => { setSpeed(speed); setShowSpeeds(false) }}
                    className={`w-full text-left px-4 py-1.5 text-sm transition-colors flex items-center justify-between gap-3
                      ${playbackSpeed === speed ? 'bg-emerald-50 text-emerald-800 font-semibold' : 'text-stone-700 hover:bg-stone-50'}`}>
                    {speed === 1 ? '1× Normal' : `${speed}×`}
                    {playbackSpeed === speed && <span className="text-emerald-500 text-xs">✓</span>}
                  </button>
                ))}
                <div className="border-t border-stone-100 mt-1 px-3 py-1.5 text-[10px] text-stone-300">
                  [ / ] to adjust
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="hidden md:flex justify-center pb-1 gap-4 text-[10px] text-stone-300">
        <span><kbd className="font-mono">Space</kbd> play/pause</span>
        <span><kbd className="font-mono">←</kbd> −15s</span>
        <span><kbd className="font-mono">→</kbd> +30s</span>
        <span><kbd className="font-mono">[</kbd><kbd className="font-mono">]</kbd> speed</span>
      </div>
    </div>
  )
}
