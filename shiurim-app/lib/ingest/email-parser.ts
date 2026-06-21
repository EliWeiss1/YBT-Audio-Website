import { simpleParser } from 'mailparser'
import type { IngestRequest } from './types'
import senderRabbiMap from '@/data/sender-rabbi-map.json'

const ZOOM_SHARE_RE = /https:\/\/zoom\.us\/rec\/share\/[A-Za-z0-9_\-]+/

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
  const zoomMatch = body.match(ZOOM_SHARE_RE)
  const zoomShareUrl = zoomMatch ? zoomMatch[0] : ''

  // Need at least a title and a Zoom link to proceed
  if (!title || !zoomShareUrl) return null

  const rabbi = get('rabbi') || (senderRabbiMap as Record<string, string>)[senderEmail] || ''
  const description = get('description')

  return { title, rabbi, description, zoomShareUrl, date: dateHeader, senderEmail }
}
