import { createBrowserClient } from '@supabase/ssr'

// Browser client - used in client components and direct imports
export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ---- Progress helpers ----

export async function getProgress(userId: string, lectureId: string) {
  const { data } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', userId)
    .eq('lecture_id', lectureId)
    .single()
  return data
}

export async function getAllProgress(userId: string) {
  const { data } = await supabase
    .from('progress')
    .select('*')
    .eq('user_id', userId)
  return data ?? []
}

export async function saveProgress(
  userId: string,
  lectureId: string,
  positionSeconds: number,
  completed = false
) {
  await supabase.from('progress').upsert({
    user_id: userId,
    lecture_id: lectureId,
    position_seconds: positionSeconds,
    completed,
    last_listened_at: new Date().toISOString(),
  }, { onConflict: 'user_id,lecture_id' })
}

// ---- Comment helpers ----

export async function getLectureComments(lectureId: string) {
  const { data } = await supabase
    .from('comments')
    .select(`*, profiles(display_name, username, avatar_url)`)
    .eq('lecture_id', lectureId)
    .order('created_at', { ascending: true })
  return data ?? []
}

export async function getFeedComments(limit = 20) {
  const { data } = await supabase
    .from('feed_comments')
    .select('*')
    .limit(limit)
  return data ?? []
}

export async function postComment(
  userId: string,
  lectureId: string,
  body: string,
  parentId?: string
) {
  const { data, error } = await supabase.from('comments').insert({
    user_id: userId,
    lecture_id: lectureId,
    body,
    parent_id: parentId ?? null,
  }).select().single()
  return { data, error }
}

// ---- Description helpers ----

export async function getLectureDescription(lectureId: string): Promise<string | null> {
  const { data } = await supabase
    .from('lecture_descriptions')
    .select('body')
    .eq('lecture_id', lectureId)
    .single()
  return data?.body ?? null
}

export async function upsertLectureDescription(
  lectureId: string,
  userId: string,
  body: string
) {
  const { error } = await supabase.from('lecture_descriptions').upsert({
    lecture_id: lectureId,
    body,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'lecture_id' })
  return { error }
}
