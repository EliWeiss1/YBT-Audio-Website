import { simpleParser } from 'mailparser'
import { convert as htmlToText } from 'html-to-text'
import type { ParseResult, RecordingPlan } from './types'
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

// A Zoom share link can hold multiple recordings (an accidental stop/restart, or two
// shiurim back-to-back). A rebbe can optionally add a keyword line under the preamble to
// say what to do: `merge`, `separate`, or `only N` (keep just the Nth recording, e.g. the
// first one was a mistake). Detected by exact text (not a fixed line number) so it still
// works when the optional rabbi/description lines are omitted.
const MODE_RE = /^(merge|separate)$/i
const PICK_RE = /^only\s+(\d+)$/i

export async function parseIngestEmail(rawEmail: Buffer): Promise<ParseResult> {
  const parsed = await simpleParser(rawEmail)

  const senderEmail = (parsed.from?.value?.[0]?.address ?? '').toLowerCase()
  const subject = (parsed.subject ?? '').trim()
  const dateHeader = parsed.date ? parsed.date.toISOString().slice(0, 10) : ''

  // PREFER the html part, converted to text, over the plain-text alternative.
  // Both Gmail and Apple Mail carry the human-typed preamble as one <div>/<p>
  // per logical line, so html-to-text (wordwrap OFF) recovers each typed line
  // intact. The text/plain alternative they ship alongside is HARD-WRAPPED at
  // ~70 cols, which splits a long shiur title across two physical lines — and
  // positional parsing then misreads the title's overflow as the rabbi and the
  // rabbi as the description. Blockquote `>` markers are stripped so the nested
  // Zoom From:/Date: headers still match. Fall back to the plain-text part only
  // when there is no html at all (e.g. a plain-text-only client).
  const htmlBody = parsed.html
    ? htmlToText(parsed.html, { wordwrap: false }).replace(/^(?:>\s?)+/gm, '')
    : ''
  const body = htmlBody || parsed.text || parsed.textAsHtml?.replace(/<[^>]+>/g, '') || ''

  // Split on the forward boundary — only the text a human typed above it is
  // treated as title/rabbi/description.
  const [preamble] = body.split(FORWARD_BOUNDARY_RE)
  const lines = (preamble ?? '').split('\n').map(l => l.trim()).filter(Boolean)

  const date = extractOriginalDate(body) || dateHeader

  const recordingUrl = findRecordingUrl(body)

  // A recording-plan keyword line splits the preamble: everything ABOVE it is the
  // usual positional title/rabbi/description; everything BELOW a `separate` keyword
  // is the remaining per-shiur titles. `merge` and `only N` need nothing below them.
  const modeIdx = lines.findIndex(l => MODE_RE.test(l) || PICK_RE.test(l))
  const pickMatch = modeIdx >= 0 ? lines[modeIdx].match(PICK_RE) : null
  const mode = modeIdx < 0 ? null
    : pickMatch ? 'pick'
    : (lines[modeIdx].toLowerCase() as 'merge' | 'separate')
  const headLines = modeIdx >= 0 ? lines.slice(0, modeIdx) : lines

  // Title must come from the first typed line — the Subject header is always
  // Zoom's generic "Meeting assets are ready" text, not the shiur's title, so it
  // is never usable as a fallback.
  const title = headLines[0] ? stripLabel(headLines[0], 'title') : ''

  const knownRabbi = (senderRabbiMap as Record<string, string>)[senderEmail] || ''

  // Line 2 is normally the rabbi's name, but no rabbi's name runs past 4 words —
  // so a longer line 2 is really a description the rebbe typed without bothering
  // to include their name (their sender email already resolves the rabbi via
  // senderRabbiMap). In that case take line 2 as the description and pull the
  // rabbi from the map.
  const line2 = headLines[1] ?? ''
  const line2IsDescription = line2.split(/\s+/).filter(Boolean).length > 4

  const rabbi = line2 && !line2IsDescription ? stripLabel(line2, 'rabbi') : knownRabbi
  const description = line2IsDescription
    ? stripLabel(line2, 'description')
    : headLines[2] ? stripLabel(headLines[2], 'description') : ''

  if (!title) return { ok: false, reason: 'no_title', senderEmail, subject }
  if (!recordingUrl) return { ok: false, reason: 'no_recording_url', senderEmail, subject }

  let multi: RecordingPlan | undefined
  if (mode === 'merge') {
    multi = { mode: 'merge', titles: [title] }
  } else if (mode === 'pick') {
    // `only N` — keep just the Nth recording. N is 1-based; the worker validates it
    // against the actual clip count.
    multi = { mode: 'pick', titles: [title], index: parseInt(pickMatch![1], 10) }
  } else if (mode === 'separate') {
    // Line 1 is reused as the first shiur's title; each line after the keyword is
    // another shiur's title. Need at least two, or there is nothing to split.
    const titles = [title, ...lines.slice(modeIdx + 1).map(l => l.trim()).filter(Boolean)]
    if (titles.length < 2) return { ok: false, reason: 'no_separate_titles', senderEmail, subject }
    multi = { mode: 'separate', titles }
  }

  return { ok: true, data: { title, rabbi, description, recordingUrl, date, senderEmail, ...(multi ? { multi } : {}) } }
}
