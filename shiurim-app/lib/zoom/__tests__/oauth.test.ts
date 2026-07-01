import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock supabase
const mockSingle = vi.fn()
const mockEq = vi.fn(() => ({ single: mockSingle }))
const mockSelect = vi.fn(() => ({ eq: mockEq }))
const mockUpsert = vi.fn(() => Promise.resolve({ error: null as { message: string } | null }))
const mockFrom = vi.fn(() => ({ select: mockSelect, upsert: mockUpsert }))
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

// Mock fetch for token refresh
const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => vi.clearAllMocks())

const { getStoredToken, storeToken, getValidAccessToken } = await import('../oauth')

describe('getStoredToken', () => {
  it('returns null when no token exists', async () => {
    mockSingle.mockResolvedValue({ data: null, error: null })
    expect(await getStoredToken('rabbi@example.com')).toBeNull()
    expect(mockEq).toHaveBeenCalledWith('sender_email', 'rabbi@example.com')
  })

  it('returns token row when found', async () => {
    const row = { sender_email: 'rabbi@example.com', zoom_user_id: 'uid1',
      access_token: 'tok', refresh_token: 'ref', expires_at: '2099-01-01T00:00:00Z' }
    mockSingle.mockResolvedValue({ data: row, error: null })
    expect(await getStoredToken('rabbi@example.com')).toEqual(row)
  })

  it('normalizes email to lowercase', async () => {
    mockSingle.mockResolvedValue({ data: null })
    await getStoredToken('Rabbi@Example.COM')
    expect(mockEq).toHaveBeenCalledWith('sender_email', 'rabbi@example.com')
  })
})

describe('getValidAccessToken', () => {
  it('returns null when no token stored', async () => {
    mockSingle.mockResolvedValue({ data: null })
    expect(await getValidAccessToken('nobody@example.com')).toBeNull()
  })

  it('returns stored access_token when not expiring soon', async () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    mockSingle.mockResolvedValue({ data: {
      sender_email: 'r@example.com', zoom_user_id: 'uid',
      access_token: 'valid_tok', refresh_token: 'ref', expires_at: future
    }})
    expect(await getValidAccessToken('r@example.com')).toBe('valid_tok')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('refreshes and returns new access_token when expiring within 5 minutes', async () => {
    const almostExpired = new Date(Date.now() + 2 * 60 * 1000).toISOString()
    mockSingle.mockResolvedValue({ data: {
      sender_email: 'r@example.com', zoom_user_id: 'uid',
      access_token: 'old_tok', refresh_token: 'old_ref', expires_at: almostExpired
    }})
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new_tok', refresh_token: 'new_ref', expires_in: 3600 }),
    })
    const token = await getValidAccessToken('r@example.com')
    expect(token).toBe('new_tok')
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('grant_type=refresh_token'),
      expect.objectContaining({ method: 'POST' })
    )
  })
})

describe('storeToken', () => {
  it('upserts with correct fields', async () => {
    await storeToken('r@example.com', 'uid1', 'atk', 'rtk', 3600)
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        sender_email: 'r@example.com',
        zoom_user_id: 'uid1',
        access_token: 'atk',
        refresh_token: 'rtk',
      }),
      { onConflict: 'sender_email' }
    )
  })

  it('throws when the upsert fails (e.g. table missing)', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'relation "zoom_oauth_tokens" does not exist' } })
    await expect(storeToken('r@example.com', 'uid1', 'atk', 'rtk', 3600)).rejects.toThrow(
      /Failed to store Zoom token/
    )
  })
})

describe('getStoredToken error handling', () => {
  it('throws on unexpected errors instead of silently returning null', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: '42P01', message: 'relation does not exist' } })
    await expect(getStoredToken('r@example.com')).rejects.toThrow(/Failed to read Zoom token/)
  })
})
