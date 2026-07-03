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

// Gmail wraps a forward in dashes ("---------- Forwarded message ---------");
// Apple Mail uses no dashes at all ("Begin forwarded message:"). Both are
// matched, but a bare "forwarded message" with neither marker is not — that's
// too weak a signal and risks truncating a real preamble.
const FORWARD_BOUNDARY_RE = /^(?:-{3,}\s*(?:Begin\s+)?[Ff]orwarded\s+message|Begin\s+[Ff]orwarded\s+message)\s*:?/m

// Apple Mail formats nested header dates as "May 31, 2026 at 11:49:52 AM EDT" —
// the literal "at" breaks JS Date parsing, so it's stripped first. Gmail's
// RFC 2822 style ("Wed, 15 Jan 2025 10:30:00 +0000") parses natively either way.
function parseHeaderDate(raw: string): string | null {
  const d = new Date(raw.replace(/\bat\b/i, '').trim())
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

// A forwarded chain nests with the newest message on the outside and Zoom's
// original notification buried deepest — so its "Date:" header (sent within
// minutes of the recording finishing, i.e. right after the shiur) is either
// the one paired with "From: ... zoom.us", or failing that, simply the LAST
// "Date:" line in the body. This is a much closer proxy for when the shiur was
// given than the date a rebbe/gabbai happened to get around to forwarding it.
function extractOriginalDate(body: string): string | null {
  const zoomBlock = body.match(/From:\s*[^\n]*(?:no-reply@)?zoom\.us[^\n]*\n\s*Date:\s*(.+)/i)
  if (zoomBlock) {
    const d = parseHeaderDate(zoomBlock[1])
    if (d) return d
  }
  const dateLines = [...body.matchAll(/^\s*Date:\s*(.+)$/gim)]
  for (let i = dateLines.length - 1; i >= 0; i--) {
    const d = parseHeaderDate(dateLines[i][1])
    if (d) return d
  }
  return null
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

  // Split on the forward boundary — only the text a human typed above it is
  // treated as title/rabbi/description.
  const [preamble] = body.split(FORWARD_BOUNDARY_RE)
  const lines = (preamble ?? '').split('\n').map(l => l.trim()).filter(Boolean)

  const date = extractOriginalDate(body) || dateHeader

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

  return { ok: true, data: { title, rabbi, description, recordingUrl, date, senderEmail } }
}
