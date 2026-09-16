import { describe, it, expect, beforeEach, vi } from 'vitest'

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

// saveProgress is the network leg — mocked so tests control success/failure
// without hitting a real Supabase project.
const saveProgressMock = vi.fn()
vi.mock('@/lib/supabase', () => ({
  saveProgress: (...args: unknown[]) => saveProgressMock(...args),
}))

async function freshModules() {
  vi.resetModules()
  saveProgressMock.mockReset()
  ;(globalThis as any).localStorage = makeLocalStorageMock()
  const queue = await import('../progress-queue')
  const local = await import('../progress-local')
  return { queue, local }
}

describe('shouldWriteProgress (pure guard)', () => {
  it('allows a normal forward-progress write with no prior', async () => {
    const { queue } = await freshModules()
    expect(queue.shouldWriteProgress(null, 120, undefined, undefined)).toBe(true)
  })

  it('blocks a bare 0 write when not deliberate (poison-loop guard)', async () => {
    const { queue } = await freshModules()
    expect(queue.shouldWriteProgress({ userId: 'u1', lectureId: 'L', position: 800, completed: false, at: 1 }, 0, undefined, undefined)).toBe(false)
  })

  it('allows a 0 write when deliberate (user rewound to the start)', async () => {
    const { queue } = await freshModules()
    expect(queue.shouldWriteProgress({ userId: 'u1', lectureId: 'L', position: 800, completed: false, at: 1 }, 0, undefined, true)).toBe(true)
  })

  it('blocks a drastic regression (>60s behind prior) when not deliberate', async () => {
    const { queue } = await freshModules()
    const prior = { userId: 'u1', lectureId: 'L', position: 800, completed: false, at: 1 }
    expect(queue.shouldWriteProgress(prior, 100, undefined, undefined)).toBe(false)
  })

  it('allows a drastic regression when deliberate (a real seek backward)', async () => {
    const { queue } = await freshModules()
    const prior = { userId: 'u1', lectureId: 'L', position: 800, completed: false, at: 1 }
    expect(queue.shouldWriteProgress(prior, 100, undefined, true)).toBe(true)
  })

  it('allows a small regression (<=60s) even when not deliberate — normal drift', async () => {
    const { queue } = await freshModules()
    const prior = { userId: 'u1', lectureId: 'L', position: 800, completed: false, at: 1 }
    expect(queue.shouldWriteProgress(prior, 760, undefined, undefined)).toBe(true)
  })

  it('always allows a completed write, even at position 0 or a big regression', async () => {
    const { queue } = await freshModules()
    const prior = { userId: 'u1', lectureId: 'L', position: 800, completed: false, at: 1 }
    expect(queue.shouldWriteProgress(prior, 0, true, undefined)).toBe(true)
    expect(queue.shouldWriteProgress(prior, 50, true, undefined)).toBe(true)
  })
})

describe('savePosition', () => {
  beforeEach(() => { saveProgressMock.mockReset() })

  it('mirrors locally even for anonymous (no userId) listeners, and skips the network', async () => {
    const { queue, local } = await freshModules()
    await queue.savePosition(undefined, 'L-1', 120, undefined, undefined, { immediate: true })
    expect(saveProgressMock).not.toHaveBeenCalled()
    expect(local.getLocalProgress(undefined, 'L-1')).toMatchObject({ position: 120 })
  })

  it('writes to Supabase for a signed-in user on success', async () => {
    saveProgressMock.mockResolvedValue({ error: null })
    const { queue, local } = await freshModules()
    await queue.savePosition('u1', 'L-1', 120, undefined, 600, { immediate: true })
    expect(saveProgressMock).toHaveBeenCalledWith('u1', 'L-1', 120, undefined, 600)
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 120 })
  })

  it('enqueues for retry when the network write fails', async () => {
    saveProgressMock.mockResolvedValue({ error: new Error('offline') })
    const { queue } = await freshModules()
    await queue.savePosition('u1', 'L-1', 120, undefined, undefined, { immediate: true })
    const raw = JSON.parse((globalThis as any).localStorage.getItem('pending-progress:v1'))
    expect(raw).toHaveLength(1)
    expect(raw[0]).toMatchObject({ userId: 'u1', lectureId: 'L-1', position: 120 })
  })

  it('teardown mode (network:false) enqueues directly without attempting a fetch', async () => {
    const { queue } = await freshModules()
    await queue.savePosition('u1', 'L-1', 300, undefined, undefined, { network: false, immediate: true })
    expect(saveProgressMock).not.toHaveBeenCalled()
    const raw = JSON.parse((globalThis as any).localStorage.getItem('pending-progress:v1'))
    expect(raw).toHaveLength(1)
  })

  it('does not write anything (mirror or network) when the guard blocks it', async () => {
    const { queue, local } = await freshModules()
    // Seed a good prior position via a first save.
    saveProgressMock.mockResolvedValue({ error: null })
    await queue.savePosition('u1', 'L-1', 800, undefined, undefined, { immediate: true })
    saveProgressMock.mockClear()
    // A bare-0 non-deliberate write must not touch the mirror or the network.
    await queue.savePosition('u1', 'L-1', 0, undefined, undefined, { immediate: true })
    expect(saveProgressMock).not.toHaveBeenCalled()
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 800 })
  })

  it('a completed write is never blocked, even after a large forward position', async () => {
    saveProgressMock.mockResolvedValue({ error: null })
    const { queue, local } = await freshModules()
    await queue.savePosition('u1', 'L-1', 3600, undefined, 3600, { immediate: true })
    saveProgressMock.mockClear()
    await queue.savePosition('u1', 'L-1', 3600, true, 3600, { immediate: true })
    expect(saveProgressMock).toHaveBeenCalledWith('u1', 'L-1', 3600, true, 3600)
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ completed: true })
  })

  it('completed undefined preserves the prior mirrored completed flag', async () => {
    saveProgressMock.mockResolvedValue({ error: null })
    const { queue, local } = await freshModules()
    await queue.savePosition('u1', 'L-1', 3600, true, 3600, { immediate: true })
    await queue.savePosition('u1', 'L-1', 3610, undefined, 3600, { immediate: true })
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ completed: true, position: 3610 })
  })

  it('an explicit completed:false clears a previously-completed mirror entry', async () => {
    saveProgressMock.mockResolvedValue({ error: null })
    const { queue, local } = await freshModules()
    await queue.savePosition('u1', 'L-1', 3600, true, 3600, { immediate: true })
    await queue.savePosition('u1', 'L-1', 30, false, 3600, { immediate: true, deliberate: true })
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ completed: false, position: 30 })
  })
})

describe('regression: poison-loop protection', () => {
  // This is the core bug the whole fix exists for: a resume seek silently
  // fails (bad Range support, iOS dropping a pre-metadata seek, a lost
  // race), playback starts at ~0, and the routine 45s interval save then
  // upserts that near-zero position over the real one — permanently
  // destroying it. shouldWriteProgress + the mirror are what stand between
  // "the seek glitched once" and "the user's place is gone forever".
  it('restore fails -> interval fires with ~0 -> stored position survives unchanged', async () => {
    saveProgressMock.mockResolvedValue({ error: null })
    const { queue, local } = await freshModules()

    // 1. The user was 40 minutes into a shiur; that got saved normally.
    await queue.savePosition('u1', 'L-1', 2400, undefined, 3600, { immediate: true })
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 2400 })

    // 2. Next play(): the resume seek silently fails (bad host, dropped
    // iOS seek, lost race) and playback actually starts at 0. The 45s
    // periodic safety-net save now fires with that ~0 currentTime — this
    // is player-context.tsx's flushProgress()/interval calling savePosition
    // with whatever audio.currentTime actually is, not deliberate.
    saveProgressMock.mockClear()
    await queue.savePosition('u1', 'L-1', 2, undefined, 3600, { immediate: true })

    // 3. Nothing was written anywhere — the good position is untouched.
    expect(saveProgressMock).not.toHaveBeenCalled()
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 2400 })
  })

  it('failed-then-recovered restore: the good position survives the failure and updates on success', async () => {
    saveProgressMock.mockResolvedValue({ error: null })
    const { queue, local } = await freshModules()

    await queue.savePosition('u1', 'L-1', 2400, undefined, 3600, { immediate: true })

    // A failed restore attempt (blocked, as above).
    await queue.savePosition('u1', 'L-1', 0, undefined, 3600, { immediate: true })
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 2400 })

    // The user later plays again, the seek succeeds this time, and they
    // keep listening — a legitimate forward-progress save now goes through
    // normally (not blocked — it's a small forward move from the real
    // stored position, not a regression).
    await queue.savePosition('u1', 'L-1', 2450, undefined, 3600, { immediate: true })
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 2450 })
  })

  it('a real deliberate rewind-to-0 is NOT treated as a poisoned write', async () => {
    saveProgressMock.mockResolvedValue({ error: null })
    const { queue, local } = await freshModules()

    await queue.savePosition('u1', 'L-1', 2400, undefined, 3600, { immediate: true })
    // The user actually scrubs back to the very start on purpose.
    await queue.savePosition('u1', 'L-1', 0, undefined, 3600, { deliberate: true, immediate: true })
    expect(local.getLocalProgress('u1', 'L-1')).toMatchObject({ position: 0 })
  })
})

describe('flushPending / initProgressQueue', () => {
  it('retries queued saves and clears them on success', async () => {
    const { queue } = await freshModules()
    await queue.savePosition('u1', 'L-1', 120, undefined, undefined, { network: false, immediate: true })
    expect(JSON.parse((globalThis as any).localStorage.getItem('pending-progress:v1'))).toHaveLength(1)

    saveProgressMock.mockResolvedValue({ error: null })
    await queue.flushPending()
    expect(saveProgressMock).toHaveBeenCalledWith('u1', 'L-1', 120, undefined, undefined)
    expect(JSON.parse((globalThis as any).localStorage.getItem('pending-progress:v1'))).toHaveLength(0)
  })

  it('keeps entries that still fail on retry', async () => {
    const { queue } = await freshModules()
    await queue.savePosition('u1', 'L-1', 120, undefined, undefined, { network: false, immediate: true })
    saveProgressMock.mockResolvedValue({ error: new Error('still offline') })
    await queue.flushPending()
    expect(JSON.parse((globalThis as any).localStorage.getItem('pending-progress:v1'))).toHaveLength(1)
  })

  it('a queued completed:true survives a later save that omits completed', async () => {
    const { queue } = await freshModules()
    // First save fails and queues completed:true.
    saveProgressMock.mockResolvedValue({ error: new Error('offline') })
    await queue.savePosition('u1', 'L-1', 3600, true, 3600, { immediate: true })
    // Second (still offline) save omits completed — should not clobber the queued true.
    await queue.savePosition('u1', 'L-1', 3600, undefined, 3600, { immediate: true })
    const raw = JSON.parse((globalThis as any).localStorage.getItem('pending-progress:v1'))
    expect(raw).toHaveLength(1)
    expect(raw[0].completed).toBe(true)
  })

  it('an explicit completed:false in a later save overrides a queued completed:true', async () => {
    const { queue } = await freshModules()
    saveProgressMock.mockResolvedValue({ error: new Error('offline') })
    await queue.savePosition('u1', 'L-1', 3600, true, 3600, { immediate: true })
    await queue.savePosition('u1', 'L-1', 30, false, 3600, { immediate: true, deliberate: true })
    const raw = JSON.parse((globalThis as any).localStorage.getItem('pending-progress:v1'))
    expect(raw).toHaveLength(1)
    expect(raw[0].completed).toBe(false)
  })
})
