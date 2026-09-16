'use client'

import { createContext, useContext, useRef, useState, useEffect, useCallback, ReactNode } from 'react'
import { savePosition, initProgressQueue } from '@/lib/progress-queue'
import { ANON, getLocalProgress, reconcile, reassignAnonProgress } from '@/lib/progress-local'
import { getProgress, getAllProgress } from '@/lib/supabase'
import { createClient } from '@/lib/supabase-browser'
import { getLectureByIdSync, loadCatalog } from '@/lib/client-catalog'
import { resolveAudioSrc, getDownloadAsLecture } from '@/lib/downloads'
import type { FlatLecture } from '@/lib/lecture-utils'

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 3]

// How close to the end a stored/remote position has to be before a "resume"
// is treated as "this was already finished" and restarted from 0 instead —
// otherwise resuming a completed shiur would seek to its last second and
// immediately re-fire `ended`.
const NEAR_END_SECONDS = 15
// Minimum difference between the position we already started at and a
// later-arriving cross-device position before we bother re-seeking — avoids
// a pointless jitter-seek to essentially the same spot.
const REMOTE_REFINE_EPSILON_SECONDS = 5
// How long to keep retrying a resume seek before giving up (and, per the
// anti-poison guard in progress-queue, giving up here never lets a stale
// write clobber the real stored position — it just stops trying to move
// the playhead).
const RESTORE_TIMEOUT_MS = 20_000
// Wall-clock time listening to a shiur that was previously marked completed
// before we clear that flag, so an accidental tap doesn't un-complete it.
const UNCOMPLETE_AFTER_MS = 30_000
// Debounce window for the mirror+network save triggered by a manual seek —
// dragging the scrub bar fires many seek() calls; only the settled value
// needs to be persisted immediately.
const SEEK_SAVE_DEBOUNCE_MS = 800

type PlayerState = {
  lecture: FlatLecture | null
  isPlaying: boolean
  currentTime: number
  duration: number
  playbackSpeed: number
  play: (lectureId: string, fallback?: FlatLecture) => void
  pause: () => void
  resume: () => void
  seek: (seconds: number) => void
  skip: (seconds: number) => void
  setSpeed: (speed: number) => void
  dismiss: () => void
}

const PlayerContext = createContext<PlayerState | null>(null)

/** On sign-in: move locally-mirrored anon progress to the now-known user,
 *  and push it to Supabase — but only where it's not already beaten by a
 *  newer remote row (e.g. the same person listening on another device). */
async function migrateAnonProgress(uid: string) {
  const moved = reassignAnonProgress(uid)
  if (moved.length === 0) return
  const remoteRows = await getAllProgress(uid).catch(() => [] as Array<{ lecture_id: string; last_listened_at: string }>)
  const remoteByLecture = new Map(remoteRows.map(r => [r.lecture_id, r]))
  for (const entry of moved.slice(0, 50)) {
    if (Date.now() - entry.at > 30 * 24 * 60 * 60 * 1000) continue // ignore >30d-old anon entries
    const remote = remoteByLecture.get(entry.lectureId)
    if (remote) {
      const remoteAt = Date.parse(remote.last_listened_at)
      if (Number.isFinite(remoteAt) && remoteAt >= entry.at) continue // remote already newer
    }
    void savePosition(uid, entry.lectureId, entry.position, entry.completed || undefined, entry.duration)
  }
}

export function PlayerProvider({ children, userId: initialUserId }: { children: ReactNode; userId?: string }) {
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
  // Server-rendered initial value; kept live by the onAuthStateChange
  // subscription below so an in-session sign-in doesn't freeze saving.
  const [userId, setUserId]         = useState<string | undefined>(initialUserId)

  // Refs so the position can be flushed from callbacks (dismiss, lecture
  // switch) without those callbacks needing `lecture`/`userId` in their
  // dependency arrays (which would recreate them, and the audio element
  // stop/switch code, on every position/lecture change).
  const lectureRef = useRef<FlatLecture | null>(null)
  const userIdRef  = useRef<string | undefined>(userId)
  useEffect(() => { lectureRef.current = lecture }, [lecture])
  useEffect(() => { userIdRef.current = userId }, [userId])

  // ── Resume/seek bookkeeping ──────────────────────────────────────────────
  // playTokenRef changes on every startPlayback (including replaying the
  // same lecture) — every async continuation (a late catalog resolve, a
  // late Supabase refine, a seek retry) checks its captured token before
  // touching the audio element, so a slow fetch for lecture X can never
  // seek lecture Y (or a since-replayed X).
  const playTokenRef = useRef(0)
  const pendingSeekRef = useRef<{ token: number; target: number; tries: number } | null>(null)
  // While a resume seek is unresolved, routine saves (the interval, pause,
  // teardown) must not write — a failed restore starting at ~0 would
  // otherwise get upserted over the real stored position (the "poison
  // loop"). Cleared as soon as the seek verifies, the near-end guard fires,
  // there's nothing to restore, or RESTORE_TIMEOUT_MS elapses.
  const restoreStateRef = useRef<'pending' | 'settled'>('settled')
  const restoreTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastUserSeekAtRef = useRef(0)
  const seekSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Guards the OS-interrupt 'pause' listener from double-flushing when the
  // pause was actually initiated by us (pause()/dismiss()/switching tracks).
  const selfPausingRef = useRef(false)
  // Set when a lecture is resumed from a previously-completed row, so a
  // one-shot timer can clear `completed` once real re-listening happens.
  const resumedFromCompletedRef = useRef<{ token: number; cleared: boolean } | null>(null)
  const uncompleteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ──────────────────────────────────────────────────────────────────────

  // Persist the currently-loaded lecture's position. Used any time playback
  // state is about to be torn down or switched to a different lecture — the
  // interval save (below) only covers ongoing playback, not the moment
  // of pausing/closing/switching itself.
  //
  // `completed` is tri-state and defaults to undefined ("leave as whatever
  // it already is") — only the `ended` handler passes `true`, and only the
  // un-complete timer passes `false`. Passing `false` here by default would
  // silently clear `completed` on every routine save.
  const flushProgress = useCallback((completed?: boolean, opts?: { network?: boolean; immediate?: boolean }) => {
    if (restoreStateRef.current === 'pending') return
    const uid = userIdRef.current
    const lec = lectureRef.current
    if (!lec || !audioRef.current) return
    const dur = Math.floor(audioRef.current.duration)
    const pos = completed
      ? (Number.isFinite(dur) && dur > 0 ? dur : Math.floor(audioRef.current.currentTime))
      : Math.floor(audioRef.current.currentTime)
    const deliberate = Date.now() - lastUserSeekAtRef.current < 10_000
    void savePosition(uid, lec.id, pos, completed, dur > 0 ? dur : undefined, { ...opts, deliberate })
  }, [])

  // Keep userId in sync with real auth state, not just the server-rendered
  // prop — a plain client-side navigation after login/logout doesn't
  // re-render the root layout, so without this subscription nothing saves
  // for the rest of the session after an in-session sign-in.
  useEffect(() => {
    const sb = createClient()
    let cancelled = false
    sb.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return
      const next = session?.user?.id
      if (next) setUserId(prev => prev ?? next)
    })
    const { data: { subscription } } = sb.auth.onAuthStateChange((event, session) => {
      const next = session?.user?.id
      const prev = userIdRef.current
      if (prev !== next) {
        // Whatever's currently playing happened while `prev` was signed
        // in — flush it under that id before switching over, rather than
        // silently losing it (or attributing it to the new user). Reads
        // `prev` from the ref (not a setState updater) so this stays a
        // one-shot side effect rather than something React may re-invoke
        // (functional setState updaters run twice under StrictMode in dev).
        if (prev && lectureRef.current && audioRef.current) {
          const dur = Math.floor(audioRef.current.duration)
          void savePosition(
            prev,
            lectureRef.current.id,
            Math.floor(audioRef.current.currentTime),
            undefined,
            dur > 0 ? dur : undefined
          )
        }
        setUserId(next)
      }
      if (event === 'SIGNED_IN' && next) void migrateAnonProgress(next)
    })
    return () => { cancelled = true; subscription.unsubscribe() }
  }, [])

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
      flushProgress(true, { immediate: true })
    }
  }, [flushProgress])

  // Periodic safety-net save while playing, in case the tab is killed
  // without a pause/close event. Kept infrequent since flushProgress()
  // already covers pause/switch/close — this just bounds worst-case loss
  // (e.g. crash) to under a minute, without upserting to Supabase every
  // few seconds for every listener.
  useEffect(() => {
    if (!lecture) return
    if (saveTimerRef.current) clearInterval(saveTimerRef.current)
    if (isPlaying) {
      saveTimerRef.current = setInterval(() => {
        flushProgress(undefined, { immediate: true })
      }, 45000)
    }
    return () => { if (saveTimerRef.current) clearInterval(saveTimerRef.current) }
  }, [isPlaying, lecture, flushProgress])

  // Schedules the one-shot "clear `completed`" write for a lecture resumed
  // from a previously-completed row — otherwise it stays permanently hidden
  // from every "in progress" query (they all filter completed=false) even
  // as new positions keep being written to it. Called directly (not from a
  // useEffect keyed on isPlaying) so it also fires when refineFromRemote
  // discovers `completed` *after* startPlayback already ran — a ref update
  // doesn't retrigger an effect, so that path would otherwise be missed.
  const scheduleUncompleteTimer = useCallback((token: number) => {
    if (uncompleteTimerRef.current) clearTimeout(uncompleteTimerRef.current)
    uncompleteTimerRef.current = setTimeout(() => {
      if (playTokenRef.current !== token) return
      const info = resumedFromCompletedRef.current
      if (!info || info.token !== token || info.cleared) return
      const audio = audioRef.current
      // Only clear if they're still actually listening — if they paused
      // and walked away, leave it; the next time they press play on this
      // still-completed row, a fresh call schedules this again.
      if (!audio || audio.paused) return
      info.cleared = true
      const uid = userIdRef.current
      const lec = lectureRef.current
      if (!uid || !lec) return
      const dur = Math.floor(audio.duration)
      void savePosition(uid, lec.id, Math.floor(audio.currentTime), false, dur > 0 ? dur : undefined, {
        deliberate: true,
        immediate: true,
      })
    }, UNCOMPLETE_AFTER_MS)
  }, [])

  // Extra insurance for the wider interval above: flush immediately when the
  // tab is backgrounded or the page is torn down, so switching apps or
  // closing the tab mid-shiur doesn't lose more than a few seconds. Always
  // flushes now (not just while playing) — a native OS-interrupt pause
  // (phone call, screen lock) leaves isPlaying false but the position still
  // needs saving. Uses network:false: a fetch kicked off here is normally
  // cancelled by the teardown before it lands, so go straight to the
  // offline queue instead of racing it.
  useEffect(() => {
    const flush = () => flushProgress(undefined, { network: false, immediate: true })
    const onVisibilityChange = () => { if (document.hidden) flush() }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('pagehide', flush)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('pagehide', flush)
    }
  }, [flushProgress])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (!audioRef.current) return
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (audioRef.current.paused) { selfPausingRef.current = false; audioRef.current.play(); setIsPlaying(true) }
          else { selfPausingRef.current = true; audioRef.current.pause(); setIsPlaying(false); flushProgress(undefined, { immediate: true }) }
          break
        case 'ArrowLeft':
          e.preventDefault()
          skipRef.current(-15)
          break
        case 'ArrowRight':
          e.preventDefault()
          skipRef.current(30)
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
  }, [flushProgress])

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

  /** A manual seek/skip: the user is taking control, so any still-pending
   *  resume attempt (which would otherwise later yank them back) is
   *  cancelled rather than left to fire later. */
  const markUserSeek = useCallback(() => {
    lastUserSeekAtRef.current = Date.now()
    pendingSeekRef.current = null
    restoreStateRef.current = 'settled'
  }, [])

  const seek = useCallback((s: number) => {
    const audio = audioRef.current
    if (!audio) return
    markUserSeek()
    audio.currentTime = s
    setCurrentTime(Math.floor(s))
    updatePositionState()
    if (seekSaveTimerRef.current) clearTimeout(seekSaveTimerRef.current)
    seekSaveTimerRef.current = setTimeout(() => flushProgress(undefined, { immediate: true }), SEEK_SAVE_DEBOUNCE_MS)
  }, [markUserSeek, updatePositionState, flushProgress])

  const skip = useCallback((s: number) => {
    const audio = audioRef.current
    if (!audio) return
    const upper = Number.isFinite(audio.duration) ? audio.duration : Infinity
    const next = Math.max(0, Math.min(upper, audio.currentTime + s))
    markUserSeek()
    audio.currentTime = next
    setCurrentTime(Math.floor(next))
    updatePositionState()
    if (seekSaveTimerRef.current) clearTimeout(seekSaveTimerRef.current)
    seekSaveTimerRef.current = setTimeout(() => flushProgress(undefined, { immediate: true }), SEEK_SAVE_DEBOUNCE_MS)
  }, [markUserSeek, updatePositionState, flushProgress])

  // Keyboard handler above is registered once ([] would be wrong since it
  // needs the latest skip) — route through a ref instead of adding skip to
  // that effect's deps, which would tear down/re-add the listener on every
  // render skip's identity changes (it doesn't in practice, but this keeps
  // the effect genuinely mount-once).
  const skipRef = useRef(skip)
  useEffect(() => { skipRef.current = skip }, [skip])

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
    ms.setActionHandler('play',         () => { selfPausingRef.current = false; audioRef.current?.play(); setIsPlaying(true);  ms.playbackState = 'playing' })
    ms.setActionHandler('pause',        () => { selfPausingRef.current = true; audioRef.current?.pause(); setIsPlaying(false); ms.playbackState = 'paused'; flushProgress(undefined, { immediate: true }) })
    ms.setActionHandler('stop',         () => onDismissRef.current())
    ms.setActionHandler('seekbackward',  (d) => skipRef.current(-(d.seekOffset ?? 15)))
    ms.setActionHandler('seekforward',   (d) => skipRef.current(d.seekOffset ?? 15))
    ms.setActionHandler('seekto',        (d) => { if (d.seekTime != null) seek(d.seekTime) })
    // iOS lock screen shows EITHER track-skip buttons OR the circular ±15s seek
    // arrows — previoustrack/nexttrack win if registered, hiding the seek arrows.
    // Android is the opposite: without previoustrack/nexttrack the notification
    // shows only play/pause (confirmed on-device; seekbackward/seekforward get
    // no visible buttons there). So register them everywhere except iOS,
    // mapped to the same ±15s seek.
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.userAgent.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document) // iPadOS reports as Mac
    if (!isIOS) {
      ms.setActionHandler('previoustrack', () => skipRef.current(-15))
      ms.setActionHandler('nexttrack',     () => skipRef.current(15))
    }
  }, [seek, flushProgress])

  // Stable ref so dismiss handler inside mediaSession 'stop' always works
  const onDismissRef = useRef<() => void>(() => {})
  // ─────────────────────────────────────────────────────────────────────────

  /** Re-apply (and verify) a pending resume seek. Called from loadedmetadata
   *  / canplay / seeked — the early `currentTime` set in startPlayback is
   *  the spec's "default playback start position" and Chrome/Firefox honor
   *  it, but nothing guarantees that (iOS Safari in particular), so this is
   *  what actually makes the resume reliable rather than best-effort. */
  const applyPendingSeek = useCallback((reason: string) => {
    const audio = audioRef.current
    const p = pendingSeekRef.current
    if (!audio || !p || p.token !== playTokenRef.current) return

    const dur = audio.duration
    if (Number.isFinite(dur) && dur > 0 && p.target >= dur - NEAR_END_SECONDS) {
      pendingSeekRef.current = null
      restoreStateRef.current = 'settled'
      audio.currentTime = 0
      return
    }
    if (!Number.isFinite(p.target) || p.target <= 0) {
      pendingSeekRef.current = null
      restoreStateRef.current = 'settled'
      return
    }
    if (Math.abs(audio.currentTime - p.target) <= 2) {
      pendingSeekRef.current = null
      restoreStateRef.current = 'settled'
      return
    }
    if (p.tries >= 3) {
      pendingSeekRef.current = null
      restoreStateRef.current = 'settled'
      if (process.env.NODE_ENV !== 'production') {
        console.warn('[player] resume seek did not verify', {
          reason, target: p.target, currentTime: audio.currentTime, readyState: audio.readyState,
        })
      }
      return
    }
    p.tries += 1
    audio.currentTime = p.target
  }, [])

  /** Create the shared <audio> element (with all listeners) if needed. */
  const ensureAudioElement = useCallback(() => {
    if (audioRef.current) return audioRef.current
    const audio = new Audio()
    audio.addEventListener('timeupdate', () => { setCurrentTime(Math.floor(audio.currentTime)); updatePositionState() })
    audio.addEventListener('loadedmetadata', () => { setDuration(Math.floor(audio.duration)); updatePositionState(); applyPendingSeek('loadedmetadata') })
    audio.addEventListener('canplay', () => applyPendingSeek('canplay'))
    audio.addEventListener('seeked', () => applyPendingSeek('seeked'))
    // Always delegate to onEndedRef so it has current userId + lecture
    audio.addEventListener('ended', () => onEndedRef.current())
    // ── Interruption sync ──────────────────────────────────────────────
    // Native 'pause' fires when the OS interrupts playback (phone call,
    // Siri, another app stealing audio focus) as well as when WE pause —
    // so this is also where the OS-interrupt case gets its position saved
    // (our own pause()/dismiss()/track-switch calls set selfPausingRef
    // first and already flush themselves, so this skips those to avoid a
    // redundant write).
    audio.addEventListener('pause', () => {
      setIsPlaying(false)
      if (!selfPausingRef.current) flushProgress(undefined, { immediate: true })
      selfPausingRef.current = false
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
  }, [updatePositionState, applyPendingSeek, flushProgress])

  /** Cross-device refinement: local storage resolves the position instantly
   *  (so playback starts in the same gesture, no network wait), then this
   *  checks Supabase and — if the listener is still on this same shiur
   *  (the play token still matches) and the remote position meaningfully
   *  differs — jumps to it. No other guard: a late-arriving true position
   *  should win over whatever we guessed locally. */
  const refineFromRemote = useCallback(async (lectureId: string, appliedStartAt: number, token: number) => {
    const uid = userIdRef.current
    if (!uid) return
    const remote = await getProgress(uid, lectureId).catch(() => null)
    if (!remote || token !== playTokenRef.current) return
    const audio = audioRef.current
    if (!audio) return

    const local = getLocalProgress(uid, lectureId)
    const { position, completed } = reconcile(local, remote)
    if (Math.abs(position - appliedStartAt) < REMOTE_REFINE_EPSILON_SECONDS) return

    if (completed) {
      resumedFromCompletedRef.current = { token, cleared: false }
      scheduleUncompleteTimer(token)
    }
    if (position <= 0) {
      audio.currentTime = 0
      return
    }
    pendingSeekRef.current = { token, target: position, tries: 0 }
    restoreStateRef.current = 'pending'
    if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current)
    restoreTimeoutRef.current = setTimeout(() => {
      if (playTokenRef.current === token) { pendingSeekRef.current = null; restoreStateRef.current = 'settled' }
    }, RESTORE_TIMEOUT_MS)
    applyPendingSeek('remote-refine')
  }, [applyPendingSeek, scheduleUncompleteTimer])

  const startPlayback = useCallback((found: FlatLecture, startAt: number, wasCompleted: boolean) => {
    const audio = ensureAudioElement()
    // Switching away from a different lecture (or re-playing after a close
    // that didn't go through dismiss) — persist its last position before the
    // src change below resets currentTime out from under us.
    if (lectureRef.current && lectureRef.current.id !== found.id) {
      selfPausingRef.current = true
      flushProgress(undefined, { immediate: true })
    }
    audio.pause()
    // Downloaded shiurim play from the service-worker cache (works offline);
    // everything else streams from the original host.
    audio.src = resolveAudioSrc(found)

    playTokenRef.current += 1
    const token = playTokenRef.current
    if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current)

    if (startAt > 0) {
      pendingSeekRef.current = { token, target: startAt, tries: 0 }
      restoreStateRef.current = 'pending'
      // Early set at readyState HAVE_NOTHING: this is the spec's "default
      // playback start position" and Chrome/Firefox honor it immediately —
      // applyPendingSeek (wired to loadedmetadata/canplay/seeked above)
      // verifies it actually took and retries/gives up otherwise.
      audio.currentTime = startAt
      restoreTimeoutRef.current = setTimeout(() => {
        if (playTokenRef.current === token) { pendingSeekRef.current = null; restoreStateRef.current = 'settled' }
      }, RESTORE_TIMEOUT_MS)
    } else {
      pendingSeekRef.current = null
      restoreStateRef.current = 'settled'
    }
    resumedFromCompletedRef.current = wasCompleted ? { token, cleared: false } : null
    if (wasCompleted) scheduleUncompleteTimer(token)

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
  }, [ensureAudioElement, setupMediaSession, updatePositionState, flushProgress, scheduleUncompleteTimer])

  const play = useCallback((lectureId: string, fallback?: FlatLecture) => {
    // Resolve where to start SYNCHRONOUSLY from the local mirror — no
    // network wait, so this stays inside the click/tap gesture (required
    // for iOS to allow audio.play()) and the old race where tapping play
    // before an async progress fetch resolved would start at 0 is gone by
    // construction: there is no async step before startPlayback runs.
    const owner = userIdRef.current ?? ANON
    const local = getLocalProgress(owner, lectureId)
    const { position: startAt, completed: wasCompleted } = reconcile(local, null)

    // Downloaded shiurim must play even when the catalog isn't available
    // (fully offline) — synthesize the lecture from the download record.
    // `fallback` is the authoritative, server-rendered lecture (the detail
    // page reads the freshly-deployed lectures.json server-side): it lets a
    // just-ingested shiur play on the first visit after a redeploy, before the
    // service worker's stale-while-revalidate catalog copy has caught up.
    const cached = getLectureByIdSync(lectureId) ?? getDownloadAsLecture(lectureId) ?? fallback
    if (cached) {
      if (cached.audioUrl) {
        startPlayback(cached, startAt, wasCompleted)
        void refineFromRemote(lectureId, startAt, playTokenRef.current)
      }
      return
    }
    // Catalog still loading (rare — it's warmed at idle). Nudge the audio
    // element inside this user gesture so iOS keeps it "unlocked", letting
    // playback start once the async lookup resolves.
    const audio = ensureAudioElement()
    audio.play().catch(() => {})
    loadCatalog()
      .then(() => {
        const found = getLectureByIdSync(lectureId) ?? getDownloadAsLecture(lectureId) ?? fallback
        if (found?.audioUrl) {
          startPlayback(found, startAt, wasCompleted)
          void refineFromRemote(lectureId, startAt, playTokenRef.current)
        }
      })
      .catch(() => {
        // Catalog fetch failed (offline) — a downloaded shiur should still play.
        const found = getDownloadAsLecture(lectureId)
        if (found?.audioUrl) startPlayback(found, startAt, wasCompleted)
      })
  }, [startPlayback, ensureAudioElement, refineFromRemote])

  const pause = useCallback(() => {
    selfPausingRef.current = true
    audioRef.current?.pause()
    setIsPlaying(false)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
      navigator.mediaSession.playbackState = 'paused'
    flushProgress(undefined, { immediate: true })
  }, [flushProgress])

  const resume = useCallback(() => {
    selfPausingRef.current = false
    audioRef.current?.play()
    setIsPlaying(true)
    if (typeof navigator !== 'undefined' && 'mediaSession' in navigator)
      navigator.mediaSession.playbackState = 'playing'
  }, [])

  const setSpeed = useCallback((speed: number) => {
    if (audioRef.current) audioRef.current.playbackRate = speed
    playbackSpeedRef.current = speed
    setPlaybackSpeed(speed)
    updatePositionState()
  }, [updatePositionState])

  const dismiss = useCallback(() => {
    // Closing the player is a valid stopping point same as pause() — persist
    // wherever the listener currently is (including a skip/seek that hasn't
    // hit the periodic interval save yet) before tearing down the audio element.
    selfPausingRef.current = true
    flushProgress(undefined, { immediate: true })
    if (seekSaveTimerRef.current) clearTimeout(seekSaveTimerRef.current)
    if (restoreTimeoutRef.current) clearTimeout(restoreTimeoutRef.current)
    if (uncompleteTimerRef.current) clearTimeout(uncompleteTimerRef.current)
    pendingSeekRef.current = null
    restoreStateRef.current = 'settled'
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
  }, [flushProgress])

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
