'use client'

import { createContext, useContext, useRef, useState, useEffect, useCallback, ReactNode } from 'react'
import { savePosition, initProgressQueue } from '@/lib/progress-queue'
import { getLectureByIdSync, loadCatalog } from '@/lib/client-catalog'
import { resolveAudioSrc, getDownloadAsLecture } from '@/lib/downloads'
import type { FlatLecture } from '@/lib/lecture-utils'

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

type PlayerState = {
  lecture: FlatLecture | null
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackSpeed: number
  play: (lectureId: string, startAt?: number) => void
  pause: () => void
  resume: () => void
  seek: (seconds: number) => void
  skip: (seconds: number) => void
  setSpeed: (speed: number) => void
  dismiss: () => void
}

const PlayerContext = createContext<PlayerState | null>(null)

export function PlayerProvider({ children, userId }: { children: ReactNode; userId?: string }) {
  const audioRef        = useRef<HTMLAudioElement | null>(null)
  const saveTimerRef    = useRef<ReturnType<typeof setInterval> | null>(null)
  const playbackSpeedRef = useRef(1)
  // Stable ref to the "ended" handler so it always closes over current userId/lecture
  const onEndedRef      = useRef<() => void>(() => {})

  const [lecture, setLecture]       = useState<FlatLecture | null>(null)
  const [isPlaying, setIsPlaying]   = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration]     = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  // Flush offline-queued progress + warm the client catalog while idle, so
  // the synchronous lookup in play() almost always hits.
  useEffect(() => {
    initProgressQueue()
    const warm = () => { loadCatalog().catch(() => {}) }
    if ('requestIdleCallback' in window) requestIdleCallback(warm)
    else setTimeout(warm, 1500)
  }, [])

  // Keep onEndedRef up to date with latest userId + lecture
  useEffect(() => {
    onEndedRef.current = () => {
      setIsPlaying(false)
      if (userId && lecture && audioRef.current) {
        const dur = Math.floor(audioRef.current.duration)
        savePosition(userId, lecture.id, dur > 0 ? dur : 0, true, dur > 0 ? dur : undefined)
      }
    }
  }, [userId, lecture])

  // Save progress every 10 seconds while playing
  useEffect(() => {
    if (!userId || !lecture) return
    if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    if (isPlaying) {
      saveTimerRef.current = setInterval(() => {
        if (audioRef.current) {
          const dur = Math.floor(audioRef.current.duration)
          savePosition(
            userId,
            lecture.id,
            Math.floor(audioRef.current.currentTime),
            false,
            dur > 0 ? dur : undefined
          )
        }
      }, 10000)
    }
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current) }
  }, [isPlaying, lecture, userId])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!audioRef.current) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (audioRef.current.paused) { audioRef.current.play(); setIsPlaying(true) }
          else { audioRef.current.pause(); setIsPlaying(false) }
          break
        case 'ArrowLeft':
          e.preventDefault()
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 15)
          break
        case 'ArrowRight':
          e.preventDefault()
          audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + 30)
          break
        case '[': {
          e.preventDefault()
          const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeedRef.current)
          if (idx > 0) {
            const next = PLAYBACK_SPEEDS[idx - 1]
            audioRef.current.playbackRate = next
            playbackSpeedRef.current = next
            setPlaybackSpeed(next)
          }
          break
        }
        case ']': {
          e.preventDefault()
          const idx = PLAYBACK_SPEEDS.indexOf(playbackSpeedRef.current)
          if (idx < PLAYBACK_SPEEDS.length - 1) {
            const next = PLAYBACK_SPEEDS[idx + 1]
            audioRef.current.playbackRate = next
            playbackSpeedRef.current = next
            setPlaybackSpeed(next)
          }
          break
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // ── Media Session API ────────────────────────────────────────────────────
  // Registers this site as the active audio session with the OS so that
  // headphone/Bluetooth play commands always come back here, not Spotify.
  const setupMediaSession = useCallback((lec: FlatLecture) => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: lec.title,
      artist: lec.speaker || 'Torah To Life',
      album: lec.breadcrumb?.slice(0, -1).join(' › ') || 'Torah To Life',
      // PNG artwork: iOS lock screen is picky — invalid/GIF artwork can
      // degrade the whole control set, not just the image.
      artwork: [
        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      ]
    })

    // Wire hardware buttons → our player actions
    const ms = navigator.mediaSession
    ms.setActionHandler('play',         () => { audioRef.current?.play(); setIsPlaying(true);  ms.playbackState = 'playing' })
    ms.setActionHandler('pause',        () => { audioRef.current?.pause(); setIsPlaying(false); ms.playbackState = 'paused'  })
    ms.setActionHandler('stop',         () => onDismissRef.current())
    ms.setActionHandler('seekbackward',  (d) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - (d.seekOffset ?? 15)) })
    ms.setActionHandler('seekforward',   (d) => { if (audioRef.current) audioRef.current.currentTime = Math.min(audioRef.current.duration, audioRef.current.currentTime + (d.seekOffset ?? 15)) })
    ms.setActionHandler('seekto',        (d) => { if (audioRef.current && d.seekTime != null) { audioRef.current.currentTime = d.seekTime; setCurrentTime(Math.floor(d.seekTime)) } })
    // Deliberately NOT registering previoustrack/nexttrack: when present they
    // claim the visible button slots on both iOS and Android, drawing |< >|
    // track-skip icons. With only seekbackward/seekforward registered, the OS
    // renders rewind/forward ±15s arrows instead.
  }, [])

  // Stable ref so dismiss handler inside mediaSession 'stop' always works
  const onDismissRef = useRef<() => void>(() => {})

  // Update positionState so the lock-screen scrubber is accurate
  const updatePositionState = useCallback(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
    if (!audioRef.current || !audioRef.current.duration) return
    try {
      navigator.mediaSession.setPositionState({
        duration:     audioRef.current.duration,
        playbackRate: audioRef.current.playbackRate,
        position:     audioRef.current.currentTime,
      })
    } catch { /* ignore if not supported */ }
  }, [])
  // ─────────────────────────────────────────────────────────────────────────

  /** Create the shared <audio> element (with all listeners) if needed. */
  const ensureAudioElement = useCallback(() => {
    if (audioRef.current) return audioRef.current
    const audio = new Audio()
    audio.addEventListener('timeupdate', () => { setCurrentTime(Math.floor(audio.currentTime)); updatePositionState() })
    audio.addEventListener('loadedmetadata', () => { setDuration(Math.floor(audio.duration)); updatePositionState() })
    // Always delegate to onEndedRef so it has current userId + lecture
    audio.addEventListener('ended', () => onEndedRef.current())
    // ── Interruption sync ──────────────────────────────────────────────
    // Native 'pause' fires when the OS interrupts playback (phone call,
    // Siri, another app stealing audio focus). Our setIsPlaying(false)
    // in pause() only runs when WE pause — so without this, the UI stays
    // stuck showing a pause button after an external interruption.
    audio.addEventListener('pause', () => {
      setIsPlaying(false)
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'paused'
    })
    // 'playing' fires when audio actually resumes after buffering or an
    // interruption ends — more reliable than 'play' for state sync.
    audio.addEventListener('playing', () => {
      setIsPlaying(true)
      if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
        navigator.mediaSession.playbackState = 'playing'
    })
    // ──────────────────────────────────────────────────────────────────
    audioRef.current = audio
    return audio
  }, [updatePositionState])

  const startPlayback = useCallback((found: FlatLecture, startAt: number) => {
    const audio = ensureAudioElement()
    audio.pause()
    // Downloaded shiurim play from the service-worker cache (works offline);
    // everything else streams from the original host.
    audio.src = resolveAudioSrc(found)
    audio.currentTime = startAt
    audio.playbackRate = playbackSpeedRef.current
    audio.play().catch(() => {})
    setLecture(found)
    setIsPlaying(true)
    setupMediaSession(found)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
      navigator.mediaSession.playbackState = 'playing'
    // Initialize the lock-screen scrubber/buttons right away, not only on
    // the first timeupdate (updatePositionState no-ops until metadata loads).
    updatePositionState()
  }, [ensureAudioElement, setupMediaSession, updatePositionState])

  const play = useCallback((lectureId: string, startAt = 0) => {
    // Downloaded shiurim must play even when the catalog isn't available
    // (fully offline) — synthesize the lecture from the download record.
    const cached = getLectureByIdSync(lectureId) ?? getDownloadAsLecture(lectureId)
    if (cached) {
      if (cached.audioUrl) startPlayback(cached, startAt)
      return
    }
    // Catalog still loading (rare — it's warmed at idle). Nudge the audio
    // element inside this user gesture so iOS keeps it "unlocked", letting
    // playback start once the async lookup resolves.
    const audio = ensureAudioElement()
    audio.play().catch(() => {})
    loadCatalog()
      .then(() => {
        const found = getLectureByIdSync(lectureId) ?? getDownloadAsLecture(lectureId)
        if (found?.audioUrl) startPlayback(found, startAt)
      })
      .catch(() => {
        // Catalog fetch failed (offline) — a downloaded shiur should still play.
        const found = getDownloadAsLecture(lectureId)
        if (found?.audioUrl) startPlayback(found, startAt)
      })
  }, [startPlayback, ensureAudioElement])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
      navigator.mediaSession.playbackState = 'paused'
    if (userId && lecture && audioRef.current) {
      const dur = Math.floor(audioRef.current.duration)
      savePosition(userId, lecture.id, Math.floor(audioRef.current.currentTime), false, dur > 0 ? dur : undefined)
    }
  }, [userId, lecture])

  const resume = useCallback(() => {
    audioRef.current?.play()
    setIsPlaying(true)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
      navigator.mediaSession.playbackState = 'playing'
  }, [])
  const seek     = useCallback((s: number) => { if (audioRef.current) { audioRef.current.currentTime = s; setCurrentTime(s); updatePositionState() } }, [updatePositionState])
  const skip     = useCallback((s: number) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + s) }, [])
  const setSpeed = useCallback((speed: number) => {
    if (audioRef.current) audioRef.current.playbackRate = speed
    playbackSpeedRef.current = speed
    setPlaybackSpeed(speed)
    updatePositionState()
  }, [updatePositionState])

  const dismiss = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none'
      // Clear all handlers so the OS knows no media session is active
      ;(['play','pause','stop','seekbackward','seekforward','seekto','previoustrack','nexttrack'] as MediaSessionAction[]).forEach(a => {
        try { navigator.mediaSession.setActionHandler(a, null) } catch { /* ignore */ }
      })
    }
    setLecture(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [])

  // Keep onDismissRef current so the mediaSession 'stop' handler works
  useEffect(() => { onDismissRef.current = dismiss }, [dismiss])

  return (
    <PlayerContext.Provider value={{ lecture, isPlaying, currentTime, duration, playbackSpeed, play, pause, resume, seek, skip, setSpeed, dismiss }}>
      {children}
    </PlayerContext.Provider>
  )
}

export function usePlayer() {
  const ctx = useContext(PlayerContext)
  if (!ctx) throw new Error('usePlayer must be used within PlayerProvider')
  return ctx
}
