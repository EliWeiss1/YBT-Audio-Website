import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase-server'

type RouteParams = { params: Promise<{ id: string }> }

export async function GET(
  _req: NextRequest,
  { params }: RouteParams
) {
  const { id: rawId } = await params
  const lectureId = decodeURIComponent(rawId)
  const supabase = await createClient()

  const { data } = await supabase
    .from('speaker_overrides')
    .select('speaker')
    .eq('lecture_id', lectureId)
    .maybeSingle()

  return NextResponse.json({ speaker: data?.speaker ?? null })
}

export async function POST(
  req: NextRequest,
  { params }: RouteParams
) {
  const { id: rawId } = await params
  const lectureId = decodeURIComponent(rawId)

  const body = await req.json().catch(() => null)
  const speaker = body?.speaker
  if (!speaker || typeof speaker !== 'string' || !speaker.trim()) {
    return NextResponse.json({ error: 'Invalid speaker' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { error } = await supabase
    .from('speaker_overrides')
    .upsert(
      { lecture_id: lectureId, speaker: speaker.trim(), updated_by: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'lecture_id' }
    )

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
