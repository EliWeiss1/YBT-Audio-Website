import { simpleParser } from 'mailparser'
import type { IngestRequest } from './types'
import senderRabbiMap from '@/data/sender-rabbi-map.json'

const ZOOM_RE     = /https:\/\/(?:[\w-]+\.)?zoom\.us\/rec\/share\/[A-Za-z0-9._\-]+/
const DROPBOX_RE  = /https:\/\/(?:www\.)?dropbox\.com\/(?:s|scl\/fi)\/[^\s"'<>]+/
const AUDIO_RE    = /https?:\/\/[^\s"'<>]+\.(?:mp3|m4a|wav|ogg|aac|flac)(?:[?#][^\s"'<>]*)?/i

function findRecordingUrl(text: string): string {
  return (
    text.match(ZOOM_RE)?.[0] ||
    text.match(DROPBOX_RE)?.[0] ||
    text.match(AUDIO_RE)?.[0] ||
    ''
  )
}

export async function parseIngestEmail(rawEmail: Buffer): Promise<IngestRequest | null> {
  const parsed = await simpleParser(rawEmail)

  const senderEmail = (parsed.from?.value?.[0]?.address ?? '').toLowerCase()
  const dateHeader = parsed.date ? parsed.date.toISOString().slice(0, 10) : ''

  // Prefer plain text body; fall back to stripping HTML
  const body = parsed.text ?? parsed.textAsHtml?.replace(/<[^>]+>/g, '') ?? ''

  // Split on "Begin forwarded message" / "Forwarded message" boundary
  const [preamble] = body.split(/^-{3,}\s*(Begin\s+)?[Ff]orwarded\s+message/m)

  // Extract structured fields from preamble lines
  const lines = (preamble ?? '').split('\n').map(l => l.trim()).filter(Boolean)
  const get = (key: string) => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, 'i')
    for (const line of lines) {
      const m = line.match(re)
      if (m) return m[1].trim()
    }
    return ''
  }

  const title = get('title')
  const recordingUrl = findRecordingUrl(body)

  // Need at least a title and a recording link to proceed
  if (!title || !recordingUrl) return null

  const rabbi = get('rabbi') || (senderRabbiMap as Record<string, string>)[senderEmail] || ''
  const description = get('description')

  return { title, rabbi, description, recordingUrl, date: dateHeader, senderEmail }
}
