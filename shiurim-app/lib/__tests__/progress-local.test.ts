import { describe, it, expect, beforeEach, vi } from 'vitest'

// The module hydrates a module-level in-memory cache from localStorage the
// first time it's touched, so each test needs a fresh module instance (via
// resetModules + dynamic import) on top of a fresh localStorage mock —
// otherwise state leaks between tests through the cache, not just storage.
function makeLocalStorageMock() {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size },
    key: (i: number) => Array.from(store.keys())[i] ?? null,
  } as Storage
}

async function freshModule() {
  vi.resetModules()
  ;(globalThis as any).localStorage = makeLocalStorageMock()
  return import('../progress-local')
}

describe('progress-local', () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  describe('get/set/clear round trip', () => {
    it('returns null for an unknown entry', async () => {
      const m = await freshModule()
      expect(m.getLocalProgress('u1', 'L-1')).toBeNull()
    })

    it('stores and retrieves an entry, scoped by userId', async () => {
      const m = await freshModule()
      m.setLocalProgress({ userId: 'u1', lectureId: 'L-1', position: 120, completed: false, at: 1000 })
      expect(m.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 120 })
      expect(m.getLocalProgress('u2', 'L-1')).toBeNull()
    })

    it('anonymous listeners are stored under the ANON key', async () => {
      const m = await freshModule()
      m.setLocalProgress({ userId: m.ANON, lectureId: 'L-1', position: 45, completed: false, at: 1000 })
      expect(m.getLocalProgress(undefined, 'L-1')).toMatchObject({ position: 45 })
    })

    it('clears an entry', async () => {
      const m = await freshModule()
      m.setLocalProgress({ userId: 'u1', lectureId: 'L-1', position: 120, completed: false, at: 1000 })
      m.clearLocalProgress('u1', 'L-1')
      expect(m.getLocalProgress('u1', 'L-1')).toBeNull()
    })
  })

  describe('persistence and quota/availability degradation', () => {
    it('persists to localStorage (after the write-through delay, or on explicit flush)', async () => {
      const m = await freshModule()
      m.setLocalProgress({ userId: 'u1', lectureId: 'L-1', position: 120, completed: false, at: 1000 })
      m.flushLocalProgress()
      expect(JSON.parse((globalThis as any).localStorage.getItem('progress-local:v1'))).toHaveProperty('u1|L-1')
    })

    it('never throws when localStorage is unavailable', async () => {
      vi.resetModules()
      delete (globalThis as any).localStorage
      const m = await import('../progress-local')
      expect(() => {
        m.setLocalProgress({ userId: 'u1', lectureId: 'L-1', position: 120, completed: false, at: 1000 })
        m.flushLocalProgress()
      }).not.toThrow()
      // In-memory state still works even though nothing persisted.
      expect(m.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 120 })
    })

    it('never throws when localStorage.setItem throws (quota exceeded)', async () => {
      vi.resetModules()
      const mock = makeLocalStorageMock()
      mock.setItem = () => { throw new Error('QuotaExceededError') }
      ;(globalThis as any).localStorage = mock
      const m = await import('../progress-local')
      expect(() => {
        m.setLocalProgress({ userId: 'u1', lectureId: 'L-1', position: 120, completed: false, at: 1000 })
        m.flushLocalProgress()
      }).not.toThrow()
    })

    it('caps entries at 300, evicting the oldest by timestamp', async () => {
      const m = await freshModule()
      for (let i = 0; i < 305; i++) {
        m.setLocalProgress({ userId: 'u1', lectureId: `L-${i}`, position: 10, completed: false, at: i })
      }
      m.flushLocalProgress()
      const stored = JSON.parse((globalThis as any).localStorage.getItem('progress-local:v1'))
      const count = Object.keys(stored).length
      expect(count).toBeLessThanOrEqual(300)
      // The oldest (at: 0..4) should have been evicted, the newest kept.
      expect(stored['u1|L-304']).toBeDefined()
      expect(stored['u1|L-0']).toBeUndefined()
    })
  })

  describe('reassignAnonProgress', () => {
    it('moves anon entries to the signed-in user id', async () => {
      const m = await freshModule()
      m.setLocalProgress({ userId: m.ANON, lectureId: 'L-1', position: 80, completed: false, at: 1000 })
      const moved = m.reassignAnonProgress('u1')
      expect(moved).toHaveLength(1)
      expect(m.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 80 })
      expect(m.getLocalProgress(undefined, 'L-1')).toBeNull()
    })

    it('does not clobber a newer real entry for the same lecture', async () => {
      const m = await freshModule()
      m.setLocalProgress({ userId: m.ANON, lectureId: 'L-1', position: 80, completed: false, at: 1000 })
      m.setLocalProgress({ userId: 'u1', lectureId: 'L-1', position: 500, completed: false, at: 5000 })
      const moved = m.reassignAnonProgress('u1')
      expect(moved).toHaveLength(0)
      expect(m.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 500 })
    })
  })

  describe('reconcile', () => {
    it('neither local nor remote -> position 0, source none', async () => {
      const m = await freshModule()
      expect(m.reconcile(null, null)).toEqual({ position: 0, completed: false, source: 'none' })
    })

    it('local only -> local wins', async () => {
      const m = await freshModule()
      const local = { userId: 'u1', lectureId: 'L-1', position: 120, completed: false, at: 1000 }
      expect(m.reconcile(local, null)).toEqual({ position: 120, completed: false, source: 'local' })
    })

    it('remote only -> remote wins', async () => {
      const m = await freshModule()
      const remote = { position_seconds: 200, completed: false, last_listened_at: new Date(1000).toISOString() }
      expect(m.reconcile(null, remote)).toEqual({ position: 200, completed: false, source: 'remote' })
    })

    it('both within 60s -> larger position wins (local ahead)', async () => {
      const m = await freshModule()
      const local = { userId: 'u1', lectureId: 'L-1', position: 500, completed: false, at: 60_000 }
      const remote = { position_seconds: 300, completed: false, last_listened_at: new Date(30_000).toISOString() }
      expect(m.reconcile(local, remote)).toMatchObject({ position: 500, source: 'local' })
    })

    it('both within 60s -> larger position wins (remote ahead)', async () => {
      const m = await freshModule()
      const local = { userId: 'u1', lectureId: 'L-1', position: 100, completed: false, at: 60_000 }
      const remote = { position_seconds: 900, completed: false, last_listened_at: new Date(30_000).toISOString() }
      expect(m.reconcile(local, remote)).toMatchObject({ position: 900, source: 'remote' })
    })

    it('outside 60s -> newest wins regardless of position (remote newer)', async () => {
      const m = await freshModule()
      const local = { userId: 'u1', lectureId: 'L-1', position: 900, completed: false, at: 1000 }
      const remote = { position_seconds: 50, completed: false, last_listened_at: new Date(500_000).toISOString() }
      expect(m.reconcile(local, remote)).toMatchObject({ position: 50, source: 'remote' })
    })

    it('outside 60s -> newest wins regardless of position (local newer)', async () => {
      const m = await freshModule()
      const local = { userId: 'u1', lectureId: 'L-1', position: 50, completed: false, at: 500_000 }
      const remote = { position_seconds: 900, completed: false, last_listened_at: new Date(1000).toISOString() }
      expect(m.reconcile(local, remote)).toMatchObject({ position: 50, source: 'local' })
    })

    it('winner completed -> position 0, completed true (replay starts over)', async () => {
      const m = await freshModule()
      const local = { userId: 'u1', lectureId: 'L-1', position: 3600, completed: true, at: 1000 }
      expect(m.reconcile(local, null)).toEqual({ position: 0, completed: true, source: 'local' })
    })

    it('loser being completed does not affect the winner', async () => {
      const m = await freshModule()
      // remote is much newer and NOT completed -> remote wins outright, its
      // own completed:false stands even though local (older) was completed.
      const local = { userId: 'u1', lectureId: 'L-1', position: 3600, completed: true, at: 1000 }
      const remote = { position_seconds: 120, completed: false, last_listened_at: new Date(500_000).toISOString() }
      expect(m.reconcile(local, remote)).toEqual({ position: 120, completed: false, source: 'remote' })
    })
  })
})
