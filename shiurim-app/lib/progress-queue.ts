// Offline-resilient progress saving. Writes that fail (no connection) are
// queued in localStorage and flushed when the network returns — so an hour
// of airplane-mode listening still syncs to Supabase afterwards.
//
// This is also the single choke point every progress save goes through
// (routine interval, pause, seek, dismiss, teardown), so it's where the
// localStorage mirror (lib/progress-local.ts) gets written and where the
// anti-poison guards live: a failed/raced restore must never be able to
// overwrite a good stored position with a bad one.

import { saveProgress } from '@/lib/supabase'
import { ANON, getLocalProgress, setLocalProgress, flushLocalProgress, type LocalProgress } from '@/lib/progress-local'

type PendingSave = {
  userId: string
  lectureId: string
  position: number
  // Tri-state, mirrors saveProgress(): undefined = leave `completed` as-is.
  completed?: boolean
  duration?: number
  at: number
}

export type SaveOptions = {
  // false = don't attempt a network fetch, enqueue it directly instead.
  // Used on page teardown (pagehide/visibilitychange), where an in-flight
  // fetch is normally cancelled before it lands anyway.
  network?: boolean
  // The user just performed the seek themselves (a rewind-to-0, or a seek
  // that legitimately moves the position backward) — bypasses the guards
  // below that exist to catch *accidental* regressions from a failed
  // restore or a stale write racing a fresher one.
  deliberate?: boolean
  // Force the localStorage mirror to persist synchronously instead of
  // going through its normal ~1s write-through delay. Used for the
  // low-frequency, must-not-lose saves (pause, dismiss, teardown); left
  // off for high-frequency ones (dragging the scrub bar) so those don't
  // stringify the whole mirror blob on every pixel of drag.
  immediate?: boolean
}

const KEY = 'pending-progress:v1'

function readQueue(): PendingSave[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]')
  } catch {
    return []
  }
}

function writeQueue(queue: PendingSave[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(queue))
  } catch {
    /* storage full — drop silently; next successful save covers it */
  }
}

function enqueue(save: PendingSave) {
  // Keep one entry per lecture (the latest position). A queued `completed:
  // true` survives being overwritten by a later save that doesn't touch
  // `completed` at all — but an explicit `completed: false` (the user
  // deliberately resuming a finished shiur) always wins, since silently
  // re-flagging it as complete would be the exact bug this fixes.
  const queue = readQueue()
  const idx = queue.findIndex(p => p.userId === save.userId && p.lectureId === save.lectureId)
  if (idx !== -1) {
    if (queue[idx].completed && save.completed === undefined) save.completed = true
    queue.splice(idx, 1)
  }
  queue.push(save)
  writeQueue(queue)
}

/**
 * Pure guard: should this write actually happen, given what's already
 * mirrored locally? Two failure modes this blocks:
 *  - a bare 0 (a failed/raced restore starting over) has zero information
 *    value and only destroys a good stored position;
 *  - a "drastic regression" — new position is way behind the last known
 *    one — which is the signature of a failed-restore-then-interval-save
 *    poisoning loop, not a real listening position.
 * Both are bypassed by `deliberate` (the user actually did this) and by
 * `completed` (finishing a shiur legitimately "regresses" nothing — it's a
 * distinct, intentional state change).
 */
export function shouldWriteProgress(
  prior: LocalProgress | null,
  positionSeconds: number,
  completed: boolean | undefined,
  deliberate: boolean | undefined
): boolean {
  if (completed) return true
  if (positionSeconds <= 0 && !deliberate) return false
  if (prior && !deliberate && positionSeconds + 60 < prior.position) return false
  return true
}

/** Drop-in replacement for saveProgress() that mirrors locally first, then
 *  queues failed/offline writes for retry. */
export async function savePosition(
  userId: string | undefined,
  lectureId: string,
  positionSeconds: number,
  completed?: boolean,
  durationSeconds?: number,
  opts?: SaveOptions
) {
  const owner = userId ?? ANON
  const prior = getLocalProgress(owner, lectureId)

  if (!shouldWriteProgress(prior, positionSeconds, completed, opts?.deliberate)) return

  setLocalProgress({
    userId: owner,
    lectureId,
    position: positionSeconds,
    duration: durationSeconds ?? prior?.duration,
    completed: completed ?? prior?.completed ?? false,
    at: Date.now(),
  })
  if (opts?.immediate) flushLocalProgress()

  if (!userId) return // anonymous — the local mirror is the only store

  if (opts?.network === false) {
    enqueue({ userId, lectureId, position: positionSeconds, completed, duration: durationSeconds, at: Date.now() })
    return
  }

  try {
    const { error } = await saveProgress(userId, lectureId, positionSeconds, completed, durationSeconds)
    if (error) throw error
    // Success — opportunistically flush anything still pending.
    void flushPending()
  } catch {
    enqueue({
      userId,
      lectureId,
      position: positionSeconds,
      completed,
      duration: durationSeconds,
      at: Date.now(),
    })
  }
}

let flushing = false

/** Retry every queued save; keeps whatever still fails. */
export async function flushPending() {
  if (flushing) return
  const queue = readQueue()
  if (queue.length === 0) return
  flushing = true
  try {
    const remaining: PendingSave[] = []
    for (const p of queue) {
      try {
        const { error } = await saveProgress(p.userId, p.lectureId, p.position, p.completed, p.duration)
        if (error) remaining.push(p)
      } catch {
        remaining.push(p)
      }
    }
    writeQueue(remaining)
  } finally {
    flushing = false
  }
}

/** Call once on app start: flush now and whenever the connection returns. */
export function initProgressQueue() {
  void flushPending()
  window.addEventListener('online', () => void flushPending())
}
