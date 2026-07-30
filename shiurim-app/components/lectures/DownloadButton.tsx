'use client'

import { useEffect, useRef, useState } from 'react'
import { isR2Hosted, type Lecture } from '@/lib/lecture-utils'
import {
  downloadLecture,
  deleteDownload,
  isDownloaded,
  isDownloadSupported,
  onDownloadsChanged,
} from '@/lib/downloads'

const DISABLED_MESSAGE = 'Download is temporarily disabled for this shiur'

type DownloadState = 'idle' | 'downloading' | 'done' | 'confirm' | 'error'

type Props = {
  lecture: Lecture & { breadcrumb?: string[] }
  size?: 'sm' | 'md'
  /** Show a text label next to the icon (used on the lecture detail page). */
  withLabel?: boolean
}

/** Save-offline button: idle → progress ring → saved (tap again to remove). */
export default function DownloadButton({ lecture, size = 'sm', withLabel = false }: Props) {
  const [supported, setSupported] = useState(false)
  const [state, setState] = useState<DownloadState>('idle')
  const [progress, setProgress] = useState(0) // 0..1
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!isDownloadSupported()) return
    setSupported(true)
    setState(isDownloaded(lecture.id) ? 'done' : 'idle')
    // Stay in sync when this lecture is downloaded/removed elsewhere
    return onDownloadsChanged(() => {
      setState(prev =>
        prev === 'downloading' || prev === 'confirm'
          ? prev
          : isDownloaded(lecture.id) ? 'done' : 'idle'
      )
    })
  }, [lecture.id])

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current) }, [])

  if (!lecture.audioUrl) return null

  const dim = size === 'sm' ? 'w-7 h-7' : 'w-9 h-9'
  const icon = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  if (!isR2Hosted(lecture.audioUrl)) {
    return (
      <button
        disabled
        title={DISABLED_MESSAGE}
        aria-label={DISABLED_MESSAGE}
        className={`shrink-0 flex items-center justify-center cursor-not-allowed opacity-50
          ${withLabel
            ? 'rounded-lg gap-1.5 px-3 py-1.5 text-xs font-medium bg-stone-100 text-stone-400 border border-stone-200'
            : `rounded-full ${dim} bg-transparent text-stone-300`}`}
      >
        <svg className={icon} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M4 17.5V19a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
        </svg>
        {withLabel && <span className="text-xs font-medium whitespace-nowrap">Unavailable</span>}
      </button>
    )
  }

  if (!supported) return null

  const handleClick = async (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (state === 'idle' || state === 'error') {
      setState('downloading')
      setProgress(0)
      try {
        await downloadLecture(lecture, (received, total) => {
          if (total > 0) setProgress(received / total)
        })
        setState('done')
      } catch {
        setState('error')
        setTimeout(() => setState(s => (s === 'error' ? 'idle' : s)), 2500)
      }
    } else if (state === 'done') {
      setState('confirm')
      confirmTimer.current = setTimeout(() => setState(s => (s === 'confirm' ? 'done' : s)), 3000)
    } else if (state === 'confirm') {
      if (confirmTimer.current) clearTimeout(confirmTimer.current)
      await deleteDownload(lecture.id)
      setState('idle')
    }
  }

  const title =
    state === 'idle' ? 'Save offline'
    : state === 'downloading' ? `Downloading… ${Math.round(progress * 100)}%`
    : state === 'done' ? 'Saved offline — tap to remove'
    : state === 'confirm' ? 'Tap again to remove download'
    : 'Download failed — tap to retry'

  // Progress ring geometry (viewBox 32×32, r=13 → circumference ≈ 81.7)
  const C = 2 * Math.PI * 13

  const circleClasses =
    state === 'done'
      ? 'bg-emerald-700 text-white hover:bg-emerald-800'
      : state === 'confirm'
        ? 'bg-red-50 text-red-500 ring-1 ring-red-200'
        : state === 'error'
          ? 'bg-red-50 text-red-400'
          : state === 'downloading'
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-transparent text-stone-300 hover:text-emerald-700 hover:bg-emerald-50'

  // Labeled variant matches the detail page's pill buttons
  const pillClasses =
    state === 'done'
      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:border-emerald-300'
      : state === 'confirm'
        ? 'bg-red-50 text-red-500 border border-red-200'
        : state === 'error'
          ? 'bg-red-50 text-red-400 border border-red-200'
          : 'bg-stone-100 text-stone-600 border border-stone-200 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'

  return (
    <button
      onClick={handleClick}
      title={title}
      aria-label={title}
      className={`relative shrink-0 flex items-center justify-center transition-all
        ${withLabel
          ? `rounded-lg gap-1.5 px-3 py-1.5 text-xs font-medium ${pillClasses}`
          : `rounded-full ${dim} ${circleClasses}`}`}
    >
      {state === 'downloading' && !withLabel && (
        <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
          <circle
            cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - progress)}
            className="transition-[stroke-dashoffset] duration-300"
          />
        </svg>
      )}

      {/* Icon */}
      {state === 'done' ? (
        <svg className={icon} fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : state === 'confirm' ? (
        <svg className={icon} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      ) : state === 'downloading' ? (
        withLabel ? (
          <svg className={`${icon} animate-spin`} fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        ) : (
          <span className={`font-semibold tabular-nums ${size === 'sm' ? 'text-[8px]' : 'text-[9px]'}`}>
            {Math.round(progress * 100)}
          </span>
        )
      ) : (
        // Arrow-into-device "save offline" glyph
        <svg className={icon} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v10m0 0l-3.5-3.5M12 13l3.5-3.5M4 17.5V19a2 2 0 002 2h12a2 2 0 002-2v-1.5" />
        </svg>
      )}

      {withLabel && (
        <span className="text-xs font-medium whitespace-nowrap">
          {state === 'idle' ? 'Save offline'
            : state === 'downloading' ? `${Math.round(progress * 100)}%`
            : state === 'done' ? 'Saved offline'
            : state === 'confirm' ? 'Remove?'
            : 'Retry'}
        </span>
      )}
    </button>
  )
}
