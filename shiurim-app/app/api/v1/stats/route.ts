import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const paramKey  = searchParams.get('key')
  const headerKey = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
  const provided  = paramKey ?? headerKey

  if (!provided || provided !== process.env.STATS_API_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const client = getServiceClient()
  if (!client) {
    return NextResponse.json({ error: 'Service not configured' }, { status: 503 })
  }

  const { data, error } = await client.rpc('api_stats')
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
