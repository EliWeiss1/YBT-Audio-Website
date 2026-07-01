import { getAllLectures } from '@/lib/lectures'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { logApiCall } from '@/lib/api-logger'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const start = Date.now()
  const { searchParams } = request.nextUrl
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null

  const speaker   = searchParams.get('speaker')
  const category  = searchParams.get('category')
  const tag       = searchParams.get('tag')
  const search    = searchParams.get('search')
  const date_from = searchParams.get('date_from')
  const date_to   = searchParams.get('date_to')
  const limit     = parseInt(searchParams.get('limit')  ?? '20', 10)
  const offset    = parseInt(searchParams.get('offset') ?? '0',  10)

  if (isNaN(limit)  || limit  < 1 || limit > 100)
    return NextResponse.json({ error: 'limit must be between 1 and 100' }, { status: 400 })
  if (isNaN(offset) || offset < 0)
    return NextResponse.json({ error: 'offset must be >= 0' }, { status: 400 })
  if (date_from && !DATE_RE.test(date_from))
    return NextResponse.json({ error: 'date_from must be YYYY-MM-DD' }, { status: 400 })
  if (date_to && !DATE_RE.test(date_to))
    return NextResponse.json({ error: 'date_to must be YYYY-MM-DD' }, { status: 400 })

  let results = getAllLectures()

  if (speaker) {
    const s = speaker.toLowerCase()
    results = results.filter(l => normalizeRabbi(l.speaker ?? '').toLowerCase().includes(s))
  }
  if (category) {
    const c = category.toLowerCase()
    results = results.filter(l =>
      l.breadcrumb.some(b => b.toLowerCase() === c) ||
      l.nodeId.toLowerCase() === c
    )
  }
  if (tag) {
    const t = tag.toLowerCase()
    results = results.filter(l => l.tags?.some(lTag => lTag.toLowerCase() === t))
  }
  if (search) {
    const s = search.toLowerCase()
    results = results.filter(l => l.title?.toLowerCase().includes(s))
  }
  if (date_from) results = results.filter(l => l.date >= date_from)
  if (date_to)   results = results.filter(l => l.date <= date_to)

  const total = results.length
  const page  = results.slice(offset, offset + limit)

  logApiCall({
    endpoint: '/api/v1/lectures',
    query_params: Object.fromEntries(searchParams.entries()),
    result_count: total,
    response_ms: Date.now() - start,
    ip,
  })

  return NextResponse.json(
    { total, offset, limit, results: page },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } }
  )
}
