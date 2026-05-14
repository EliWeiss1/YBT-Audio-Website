'use client'

import { createContext, useContext, useRef, useState, useEffect, useCallback, ReactNode } from 'react'
import { saveProgress } from '@/lib/supabase'
import { getLectureById, FlatLecture } from '@/lib/lectures'

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
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const playbackSpeedRef = useRef(1)
  const [lecture, setLecture] = useState<FlatLecture | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playbackSpeed, setPlaybackSpeed] = useState(1)

  // Save progress every 10 seconds
  useEffect(() => {
    if (!userId || !lecture) return
    if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    if (isPlaying) {
      saveTimerRef.current = setInterval(() => {
        if (audioRef.current) {
          saveProgress(userId, lecture.id, Math.floor(audioRef.current.currentTime), audioRef.current.ended)
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

  const play = useCallback((lectureId: string, startAt = 0) => {
    const found = getLectureById(lectureId)
    if (!found || !found.audioUrl) return
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = found.audioUrl
      audioRef.current.currentTime = startAt
      audioRef.current.playbackRate = playbackSpeedRef.current
      audioRef.current.play().catch(() => {})
    } else {
      const audio = new Audio(found.audioUrl)
      audio.currentTime = startAt
      audio.playbackRate = playbackSpeedRef.current
      audio.addEventListener('timeupdate', () => setCurrentTime(Math.floor(audio.currentTime)))
      audio.addEventListener('loadedmetadata', () => setDuration(Math.floor(audio.duration)))
      audio.addEventListener('ended', () => setIsPlaying(false))
      audio.play().catch(() => {})
      audioRef.current = audio
    }
    setLecture(found)
    setIsPlaying(true)
  }, [])

  const pause = useCallback(() => {
    audioRef.current?.pause()
    setIsPlaying(false)
    if (userId && lecture && audioRef.current) {
      saveProgress(userId, lecture.id, Math.floor(audioRef.current.currentTime), false)
    }
  }, [userId, lecture])

  const resume = useCallback(() => { audioRef.current?.play(); setIsPlaying(true) }, [])
  const seek = useCallback((s: number) => { if (audioRef.current) { audioRef.current.currentTime = s; setCurrentTime(s) } }, [])
  const skip = useCallback((s: number) => { if (audioRef.current) audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + s) }, [])
  const setSpeed = useCallback((speed: number) => {
    if (audioRef.current) audioRef.current.playbackRate = speed
    playbackSpeedRef.current = speed
    setPlaybackSpeed(speed)
  }, [])

  const dismiss = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    setLecture(null)
    setIsPlaying(false)
    setCurrentTime(0)
    setDuration(0)
  }, [])

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