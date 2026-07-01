import { resolveViaZoomApi } from '@/lib/zoom/recordings'

export type ZoomResolveResult =
  | { ok: true; downloadUrl: string; contentType: string; matchedBy?: 'exact' | 'fallback' }
  | { ok: false; reason: 'passcode_required' | 'fetch_failed' | 'no_audio_found' | 'no_oauth_token'; detail?: string }

const AUDIO_CONTENT_TYPES = ['audio/', 'video/', 'application/octet-stream', 'mpeg']

function isAudioContentType(ct: string) {
  return AUDIO_CONTENT_TYPES.some(t => ct.includes(t))
}

function toDropboxDirectUrl(url: string): string {
  // Force direct download: replace or append dl=1
  if (url.includes('dl=0')) return url.replace('dl=0', 'dl=1')
  if (url.includes('dl=1')) return url
  return url.includes('?') ? url + '&dl=1' : url + '?dl=1'
}

async function fetchAudio(url: string): Promise<ZoomResolveResult> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; shiur-ingest/1.0)' },
      redirect: 'follow',
    })
  } catch (e) {
    return { ok: false, reason: 'fetch_failed', detail: String(e) }
  }

  if (!response.ok) {
    return { ok: false, reason: 'fetch_failed', detail: `HTTP ${response.status}` }
  }

  const contentType = response.headers.get('content-type') ?? ''
  if (isAudioContentType(contentType)) {
    return { ok: true, downloadUrl: response.url, contentType }
  }

  return { ok: false, reason: 'no_audio_found', detail: `Unexpected content-type: ${contentType}` }
}

export async function resolveRecordingUrl(recordingUrl: string, senderEmail?: string): Promise<ZoomResolveResult> {
  // Direct audio file URL
  if (/\.(mp3|m4a|wav|ogg|aac|flac)(\?|#|$)/i.test(recordingUrl)) {
    return fetchAudio(recordingUrl)
  }

  // Dropbox shared link — force direct download
  if (recordingUrl.includes('dropbox.com')) {
    return fetchAudio(toDropboxDirectUrl(recordingUrl))
  }

  // Zoom cloud recording share link
  if (recordingUrl.includes('zoom.us/rec/share/')) {
    // Try OAuth API path first
    if (senderEmail) {
      const apiResult = await resolveViaZoomApi(recordingUrl, senderEmail)
      if (apiResult.ok) return apiResult
      if (apiResult.reason === 'no_oauth_token') return apiResult  // caller will notify admin
    }

    // Fall back to public /rec/download/ trick (works for some accounts)
    const downloadUrl = recordingUrl.replace('/rec/share/', '/rec/download/')
    const result = await fetchAudio(downloadUrl)
    if (result.ok) return result

    // Check if passcode is required
    try {
      const response = await fetch(downloadUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; shiur-ingest/1.0)' },
        redirect: 'follow',
      })
      if (response.ok) {
        const html = await response.text()
        if (html.includes('type="password"') || html.includes("type='password'")) {
          return { ok: false, reason: 'passcode_required' }
        }
      }
    } catch { /* ignore */ }

    return {
      ok: false,
      reason: 'no_audio_found',
      detail: 'Zoom cloud recordings require API access; see docs/zoom-api-setup.md',
    }
  }

  // Unknown URL type — try fetching it directly anyway
  return fetchAudio(recordingUrl)
}

// Keep old export name as alias so any other callers don't break
export const resolveZoomShareUrl = resolveRecordingUrl
