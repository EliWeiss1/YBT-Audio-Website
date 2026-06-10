// Offline-resilient progress saving. Writes that fail (no connection) are
// queued in localStorage and flushed when the network returns — so an hour
// of airplane-mode listening still syncs to Supabase afterwards.

import { saveProgress } from '@/lib/supabase'

type PendingSave = {
  userId: string
  lectureId: string
  position: number
  completed: boolean
  duration?: number
  at: number
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
  // Keep one entry per lecture (the latest position); a queued `completed`
  // flag survives being overwritten by a later non-completed position.
  const queue = readQueue()
  const idx = queue.findIndex(p => p.userId === save.userId && p.lectureId === save.lectureId)
  if (idx !== -1) {
    if (queue[idx].completed) save.completed = true
    queue.splice(idx, 1)
  }
  queue.push(save)
  writeQueue(queue)
}

/** Drop-in replacement for saveProgress() that queues failed writes. */
export async function savePosition(
  userId: string,
  lectureId: string,
  positionSeconds: number,
  completed = false,
  durationSeconds?: number
) {
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
