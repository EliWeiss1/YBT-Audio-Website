import { getLectureById } from '@/lib/lectures'
import { r2KeyFromUrl, presignR2Download } from '@/lib/r2'
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

  // Derive a clean filename: "<title>.mp3"
  const safeTitle = lecture.title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, ' ')
  const filename = `${safeTitle}.mp3`

  // Files hosted on our R2 bucket: redirect straight to a presigned R2 URL so
  // the browser downloads directly from R2 instead of streaming the whole
  // file through this function (which burns Vercel's Fast Origin Transfer
  // quota). The `download` attribute is ignored for cross-origin URLs, so we
  // use ResponseContentDisposition on the presigned URL to force the filename
  // instead of proxying bytes ourselves.
  const r2Key = r2KeyFromUrl(audioUrl)
  if (r2Key) {
    const signedUrl = await presignR2Download(r2Key, filename)
    return NextResponse.redirect(signedUrl, 302)
  }

  // Legacy (non-R2) upstream hosts lack CORS and can't be presigned, so we
  // still have to proxy those through this route.
  const upstream = await fetch(audioUrl)
  if (!upstream.ok) {
    return new NextResponse('Audio fetch failed', { status: 502 })
  }

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
