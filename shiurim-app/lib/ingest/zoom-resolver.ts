/**
 * Attempts to resolve a Zoom share page URL to a direct audio download URL.
 * Zoom share links like zoom.us/rec/share/... may be publicly accessible.
 * If the page requires a passcode or returns an error, we cannot proceed —
 * the caller should log this as a failed ingestion.
 */
export type ZoomResolveResult =
  | { ok: true; downloadUrl: string; contentType: string }
  | { ok: false; reason: 'passcode_required' | 'fetch_failed' | 'no_audio_found'; detail?: string }

export async function resolveZoomShareUrl(shareUrl: string): Promise<ZoomResolveResult> {
  let response: Response
  try {
    response = await fetch(shareUrl, {
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

  // If Zoom returns audio directly (rare but possible for some share types)
  if (contentType.startsWith('audio/') || contentType.includes('mpeg')) {
    return { ok: true, downloadUrl: shareUrl, contentType }
  }

  // Zoom share pages redirect to a page that requires passcode entry
  const html = await response.text()
  if (html.includes('passcode') || html.includes('password') || html.includes('pwd=')) {
    return { ok: false, reason: 'passcode_required' }
  }

  // Try to extract the direct download URL from the page HTML
  // Zoom embed pages contain a direct file URL in a <source> tag or data attribute
  const sourceMatch = html.match(/["'](https:\/\/[^"']*\.mp(?:3|4)[^"']*)["']/)
  if (sourceMatch) {
    return { ok: true, downloadUrl: sourceMatch[1], contentType: 'audio/mpeg' }
  }

  return { ok: false, reason: 'no_audio_found', detail: 'Could not extract audio URL from share page' }
}
