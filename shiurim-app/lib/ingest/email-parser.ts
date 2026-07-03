import { simpleParser } from 'mailparser'
import type { ParseResult } from './types'
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

// Rebbeim aren't expected to type "Title:"/"Rabbi:"/"Description:" labels — the
// convention is positional (title on line 1, rabbi optionally on line 2, description
// optionally on line 3). Still strip a leading label if someone types one out of habit.
function stripLabel(line: string, label: string): string {
  const m = line.match(new RegExp(`^${label}:\\s*(.*)$`, 'i'))
  return (m ? m[1] : line).trim()
}

export async function parseIngestEmail(rawEmail: Buffer): Promise<ParseResult> {
  const parsed = await simpleParser(rawEmail)

  const senderEmail = (parsed.from?.value?.[0]?.address ?? '').toLowerCase()
  const subject = (parsed.subject ?? '').trim()
  const dateHeader = parsed.date ? parsed.date.toISOString().slice(0, 10) : ''

  // Prefer plain text body; fall back to stripping HTML
  const body = parsed.text ?? parsed.textAsHtml?.replace(/<[^>]+>/g, '') ?? ''

  // Split on "Begin forwarded message" / "Forwarded message" boundary — only the
  // text a human typed above that boundary is treated as title/rabbi/description.
  const [preamble] = body.split(/^-{3,}\s*(Begin\s+)?[Ff]orwarded\s+message/m)
  const lines = (preamble ?? '').split('\n').map(l => l.trim()).filter(Boolean)

  const recordingUrl = findRecordingUrl(body)

  // Title must come from the first typed line — the Subject header is always
  // Zoom's generic "Meeting assets are ready" text, not the shiur's title, so it
  // is never usable as a fallback.
  const title = lines[0] ? stripLabel(lines[0], 'title') : ''

  const knownRabbi = (senderRabbiMap as Record<string, string>)[senderEmail] || ''
  const rabbi = lines[1] ? stripLabel(lines[1], 'rabbi') : knownRabbi
  const description = lines[2] ? stripLabel(lines[2], 'description') : ''

  if (!title) return { ok: false, reason: 'no_title', senderEmail, subject }
  if (!recordingUrl) return { ok: false, reason: 'no_recording_url', senderEmail, subject }

  return { ok: true, data: { title, rabbi, description, recordingUrl, date: dateHeader, senderEmail } }
}
