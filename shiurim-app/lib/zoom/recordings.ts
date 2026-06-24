import { getValidAccessToken } from './oauth'
import type { ZoomResolveResult } from '@/lib/ingest/zoom-resolver'

interface ZoomRecordingFile {
  file_type: string
  download_url: string
  status: string
}

interface ZoomMeeting {
  share_url: string
  start_time: string
  topic: string
  recording_files: ZoomRecordingFile[]
}

function shareUrlPath(url: string): string {
  try { return new URL(url).pathname } catch { return url }
}

export async function resolveViaZoomApi(
  shareUrl: string,
  senderEmail: string
): Promise<ZoomResolveResult> {
  const accessToken = await getValidAccessToken(senderEmail)
  if (!accessToken) {
    return { ok: false, reason: 'no_oauth_token', detail: `No Zoom token stored for ${senderEmail}` }
  }

  const to = new Date().toISOString().slice(0, 10)
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)

  const res = await fetch(
    `https://api.zoom.us/v2/users/me/recordings?from=${from}&to=${to}&page_size=30`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    return { ok: false, reason: 'fetch_failed', detail: `Zoom API ${res.status}` }
  }

  const data = await res.json() as { meetings: ZoomMeeting[] }
  const meetings = data.meetings ?? []

  if (meetings.length === 0) {
    return { ok: false, reason: 'no_audio_found', detail: 'No recordings found in last 14 days' }
  }

  const normalizedShare = shareUrlPath(shareUrl)
  const meeting =
    meetings.find(m => shareUrlPath(m.share_url) === normalizedShare) ??
    meetings.sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())[0]

  const audioFile = meeting.recording_files.find(
    f => f.file_type === 'M4A' && f.status === 'completed'
  )
  if (!audioFile) {
    return { ok: false, reason: 'no_audio_found', detail: 'No M4A file in recording' }
  }

  return {
    ok: true,
    downloadUrl: `${audioFile.download_url}?access_token=${encodeURIComponent(accessToken)}`,
    contentType: 'audio/mp4',
  }
}
