import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetValidAccessToken = vi.fn()
vi.mock('../oauth', () => ({ getValidAccessToken: mockGetValidAccessToken }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

beforeEach(() => vi.clearAllMocks())

const { resolveViaZoomApi } = await import('../recordings')

const SHARE_URL = 'https://us06web.zoom.us/rec/share/TOKEN123'

const makeApiResponse = (shareUrl: string, fileType = 'M4A') => ({
  meetings: [{
    share_url: shareUrl,
    start_time: '2026-05-31T10:20:00Z',
    topic: "Rabbi's Shiur",
    recording_files: [{
      file_type: fileType,
      download_url: 'https://us06web.zoom.us/rec/download/AUDIO',
      status: 'completed',
    }],
  }],
})

describe('resolveViaZoomApi', () => {
  it('returns no_oauth_token when no token stored', async () => {
    mockGetValidAccessToken.mockResolvedValue(null)
    const result = await resolveViaZoomApi(SHARE_URL, 'rabbi@example.com')
    expect(result).toEqual({ ok: false, reason: 'no_oauth_token', detail: expect.stringContaining('rabbi@example.com') })
  })

  it('returns fetch_failed on Zoom API error', async () => {
    mockGetValidAccessToken.mockResolvedValue('tok')
    mockFetch.mockResolvedValue({ ok: false, status: 401 })
    const result = await resolveViaZoomApi(SHARE_URL, 'rabbi@example.com')
    expect(result).toEqual({ ok: false, reason: 'fetch_failed', detail: 'Zoom API 401' })
  })

  it('returns download URL when share_url matches exactly', async () => {
    mockGetValidAccessToken.mockResolvedValue('mytoken')
    mockFetch.mockResolvedValue({ ok: true, json: async () => makeApiResponse(SHARE_URL) })
    const result = await resolveViaZoomApi(SHARE_URL, 'rabbi@example.com')
    expect(result).toEqual({
      ok: true,
      downloadUrl: 'https://us06web.zoom.us/rec/download/AUDIO?access_token=mytoken',
      contentType: 'audio/mp4',
    })
  })

  it('falls back to most recent recording when share URL does not match', async () => {
    mockGetValidAccessToken.mockResolvedValue('tok')
    mockFetch.mockResolvedValue({ ok: true, json: async () => makeApiResponse('https://zoom.us/rec/share/OTHER') })
    const result = await resolveViaZoomApi(SHARE_URL, 'rabbi@example.com')
    expect(result).toMatchObject({ ok: true })
  })

  it('returns no_audio_found when no meetings exist', async () => {
    mockGetValidAccessToken.mockResolvedValue('tok')
    mockFetch.mockResolvedValue({ ok: true, json: async () => ({ meetings: [] }) })
    const result = await resolveViaZoomApi(SHARE_URL, 'rabbi@example.com')
    expect(result).toEqual({ ok: false, reason: 'no_audio_found', detail: 'No recordings found in last 14 days' })
  })

  it('returns no_audio_found when no M4A file in meeting', async () => {
    mockGetValidAccessToken.mockResolvedValue('tok')
    mockFetch.mockResolvedValue({ ok: true, json: async () => makeApiResponse(SHARE_URL, 'MP4') })
    const result = await resolveViaZoomApi(SHARE_URL, 'rabbi@example.com')
    expect(result).toEqual({ ok: false, reason: 'no_audio_found', detail: 'No M4A file in recording' })
  })
})
