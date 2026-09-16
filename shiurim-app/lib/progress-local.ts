// Local mirror of playback progress. Written synchronously (in-memory) on
// every save, before the Supabase round trip, so:
//   - resume is instant (no network wait) instead of racing a fetch, and
//   - anonymous listeners get resume at all (Supabase progress is
//     signed-in-only) — see lib/player-context.tsx for the funnel.
//
// Supabase stays the cross-device source of truth; this is a same-device
// accelerant + offline/anonymous fallback, reconciled by reconcile() below.
//
// Deliberately a single JSON blob (not one localStorage key per lecture) so
// a read/write is one parse/stringify, and an in-memory map so repeated
// reads during a session (every play(), every scrub) don't re-parse it.

export const ANON = 'anon'

export type LocalProgress = {
  userId: string // real user id, or ANON for logged-out listeners
  lectureId: string
  position: number
  duration?: number
  completed: boolean
  at: number // epoch ms, client clock
}

type RemoteProgress = {
  position_seconds: number
  completed: boolean
  last_listened_at: string
  duration_seconds?: number | null
}

const KEY = 'progress-local:v1'
const MAX_ENTRIES = 300
// Trailing-write delay for the localStorage persist (the in-memory map is
// always up to date immediately) — keeps rapid scrubbing from stringifying
// the whole blob on every pixel of drag. flushLocalProgress() bypasses this
// for teardown paths (pause/pagehide/visibilitychange).
const WRITE_DELAY_MS = 1000

const key = (userId: string, lectureId: string) => `${userId}|${lectureId}`

let cache: Record<string, LocalProgress> | null = null
let writeTimer: ReturnType<typeof setTimeout> | null = null
let dirty = false

function hasStorage(): boolean {
  return typeof localStorage !== 'undefined'
}

function load(): Record<string, LocalProgress> {
  if (cache) return cache
  if (!hasStorage()) return (cache = {})
  try {
    const raw = localStorage.getItem(KEY)
    cache = raw ? JSON.parse(raw) : {}
  } catch {
    cache = {}
  }
  return cache!
}

function persistNow() {
  if (writeTimer) {
    clearTimeout(writeTimer)
    writeTimer = null
  }
  if (!dirty || !cache || !hasStorage()) {
    dirty = false
    return
  }
  try {
    let entries = Object.entries(cache)
    if (entries.length > MAX_ENTRIES) {
      entries = entries.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_ENTRIES)
      cache = Object.fromEntries(entries)
    }
    localStorage.setItem(KEY, JSON.stringify(cache))
  } catch {
    // Quota exceeded or storage blocked (private mode) — in-memory state
    // (and thus this session's resume) still works; just won't persist.
  }
  dirty = false
}

function schedulePersist() {
  dirty = true
  if (writeTimer) return
  writeTimer = setTimeout(persistNow, WRITE_DELAY_MS)
}

/** Force any pending write out immediately. Call on pause/pagehide/visibilitychange. */
export function flushLocalProgress(): void {
  persistNow()
}

// Keep tabs in sync — a write in one tab's write-through should be visible
// to a resume in another without waiting on this tab's own timer.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) cache = null // re-hydrate lazily on next read
  })
}

export function getLocalProgress(userId: string | undefined, lectureId: string): LocalProgress | null {
  const map = load()
  return map[key(userId ?? ANON, lectureId)] ?? null
}

export function setLocalProgress(entry: LocalProgress): void {
  const map = load()
  map[key(entry.userId, entry.lectureId)] = entry
  schedulePersist()
}

export function clearLocalProgress(userId: string | undefined, lectureId: string): void {
  const map = load()
  delete map[key(userId ?? ANON, lectureId)]
  schedulePersist()
}

export function listLocalProgress(userId: string): LocalProgress[] {
  const map = load()
  const prefix = `${userId}|`
  return Object.values(map).filter((e) => e.userId === userId && key(e.userId, e.lectureId).startsWith(prefix))
}

/** On sign-in: move anon-scoped entries over to the now-known user id.
 *  Returns the moved entries so the caller can push them to Supabase. */
export function reassignAnonProgress(toUserId: string): LocalProgress[] {
  const map = load()
  const moved: LocalProgress[] = []
  for (const [k, entry] of Object.entries(map)) {
    if (entry.userId !== ANON) continue
    const reassigned: LocalProgress = { ...entry, userId: toUserId }
    delete map[k]
    // Don't clobber a real entry that's already there for this user+lecture.
    const newKey = key(toUserId, entry.lectureId)
    const existing = map[newKey]
    if (!existing || existing.at < reassigned.at) {
      map[newKey] = reassigned
      moved.push(reassigned)
    }
  }
  schedulePersist()
  return moved
}

/**
 * Decide the winning position/completed between the local mirror and a
 * Supabase row. Rules, in order:
 *  1. Neither exists -> nothing to resume from.
 *  2. Only one exists -> that one.
 *  3. Both, within 60s of each other (same-clock near-tie, since
 *     last_listened_at is itself written by this client) -> larger position
 *     wins, since further-along is always the safer guess for "where was I".
 *  4. Otherwise -> newest wins.
 *  5. If the winner is completed -> position 0 (replaying a finished shiur
 *     starts over, it doesn't seek to the last second and instantly re-fire
 *     'ended').
 */
export function reconcile(
  local: LocalProgress | null,
  remote: RemoteProgress | null
): { position: number; completed: boolean; source: 'local' | 'remote' | 'none' } {
  if (!local && !remote) return { position: 0, completed: false, source: 'none' }
  if (!remote) return finish(local!.position, local!.completed, 'local')
  if (!local) return finish(remote.position_seconds, remote.completed, 'remote')

  const remoteAt = Date.parse(remote.last_listened_at)
  const remoteAtMs = Number.isFinite(remoteAt) ? remoteAt : 0

  if (Math.abs(local.at - remoteAtMs) <= 60_000) {
    return local.position >= remote.position_seconds
      ? finish(local.position, local.completed, 'local')
      : finish(remote.position_seconds, remote.completed, 'remote')
  }

  return local.at >= remoteAtMs
    ? finish(local.position, local.completed, 'local')
    : finish(remote.position_seconds, remote.completed, 'remote')
}

function finish(
  position: number,
  completed: boolean,
  source: 'local' | 'remote'
): { position: number; completed: boolean; source: 'local' | 'remote' } {
  return completed ? { position: 0, completed: true, source } : { position, completed: false, source }
}
