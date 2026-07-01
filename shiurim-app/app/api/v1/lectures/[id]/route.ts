import { getLectureById } from '@/lib/lectures'
import { logApiCall } from '@/lib/api-logger'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

type Props = {
  params: Promise<{ id: string }>
}

export async function GET(request: NextRequest, { params }: Props) {
  const start = Date.now()
  const { id: rawId } = await params
  const id = decodeURIComponent(rawId)
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const lecture = getLectureById(id)

  logApiCall({
    endpoint: '/api/v1/lectures/[id]',
    query_params: { id },
    result_count: lecture ? 1 : 0,
    response_ms: Date.now() - start,
    ip,
  })

  if (!lecture) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json(lecture)
}
