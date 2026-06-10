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

export async function getRecentInProgress(
  userId: string,
  limit = 5
): Promise<Array<{ lecture_id: string; position_seconds: number; completed: boolean; last_listened_at: string }>> {
  const { data } = await supabase
    .from('progress')
    .select('lecture_id, position_seconds, completed, last_listened_at')
    .eq('user_id', userId)
    .eq('completed', false)
    .gt('position_seconds', 0)
    .order('last_listened_at', { ascending: false })
    .limit(limit)
  return data ?? []
}

export async function saveProgress(
  userId: string,
  lectureId: string,
  positionSeconds: number,
  completed = false,
  durationSeconds?: number
) {
  const record: Record<string, unknown> = {
    user_id: userId,
    lecture_id: lectureId,
    position_seconds: positionSeconds,
    last_listened_at: new Date().toISOString(),
  }
  if (durationSeconds && durationSeconds > 0) {
    record.duration_seconds = durationSeconds
  }
  // Never downgrade a completed shiur back to in-progress.
  // Only include `completed` in the upsert when it is true.
  if (completed) {
    record.completed = true
  }
  // Surface failures (e.g. offline) so lib/progress-queue.ts can queue retries.
  const { error } = await supabase.from('progress').upsert(record, { onConflict: 'user_id,lecture_id' })
  return { error }
}

export async function deleteProgress(userId: string, lectureId: string) {
  await supabase
    .from('progress')
    .delete()
    .eq('user_id', userId)
    .eq('lecture_id', lectureId)
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

export async function updateComment(
  commentId: string,
  userId: string,
  body: string
) {
  const { error } = await supabase
    .from('comments')
    .update({ body })
    .eq('id', commentId)
    .eq('user_id', userId)
  return { error }
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

// ---- Saved lectures helpers ----

export async function getSavedLectureIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('saved_lectures')
    .select('lecture_id')
    .eq('user_id', userId)
    .order('saved_at', { ascending: false })
  return (data ?? []).map(r => r.lecture_id)
}

export async function saveLecture(userId: string, lectureId: string) {
  await supabase.from('saved_lectures').upsert(
    { user_id: userId, lecture_id: lectureId, saved_at: new Date().toISOString() },
    { onConflict: 'user_id,lecture_id' }
  )
}

export async function unsaveLecture(userId: string, lectureId: string) {
  await supabase
    .from('saved_lectures')
    .delete()
    .eq('user_id', userId)
    .eq('lecture_id', lectureId)
}
