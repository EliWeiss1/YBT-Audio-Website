import { getLectureById } from '@/lib/lectures'
import { notFound } from 'next/navigation'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type Props = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: Props) {
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  const lecture = getLectureById(id)
  if (!lecture) return notFound()

  const audioUrl = lecture.audioUrl
  if (!audioUrl) {
    return new NextResponse('No audio available', { status: 404 })
  }

  // Stream the R2 file through this route so the browser treats it as a download.
  // The `download` attribute is ignored for cross-origin URLs, so proxying is required.
  const upstream = await fetch(audioUrl)
  if (!upstream.ok) {
    return new NextResponse('Audio fetch failed', { status: 502 })
  }

  // Derive a clean filename: "<title>.mp3"
  const safeTitle = lecture.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ')
  const filename = `${safeTitle}.mp3`

  const headers = new Headers({
    'Content-Type': upstream.headers.get('Content-Type') ?? 'audio/mpeg',
    'Content-Disposition': `attachment; filename="${filename}"`,
    // Forward Content-Length so browsers can show download progress
    ...(upstream.headers.get('Content-Length')
      ? { 'Content-Length': upstream.headers.get('Content-Length')! }
      : {}),
    'Cache-Control': 'public, max-age=86400',
  })

  return new NextResponse(upstream.body, { status: 200, headers })
}
