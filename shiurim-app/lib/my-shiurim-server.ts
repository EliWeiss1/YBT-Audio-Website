// Server-side loader for the "My Shiurim" strip (continue-listening + saved).
// Shared by every library tab so the strip appears identically on the homepage
// and on /ttl — see components/lectures/MyShiurim.tsx for the UI.

import { createClient } from '@/lib/supabase-server'
import type { User } from '@supabase/supabase-js'

export type MyShiurimProgressRow = {
  lecture_id: string
  position_seconds: number
  completed: boolean
  last_listened_at: string
  duration_seconds?: number | null
}

export type MyShiurimData = {
  user: User | null
  progressRows: MyShiurimProgressRow[]
  savedIds: string[]
  /** True when there is actually something to show. */
  hasAny: boolean
}

/** Fetches the signed-in user plus the five most recent in-progress and saved
 *  shiurim. Returns empty lists (and hasAny false) for signed-out visitors. */
export async function getMyShiurimData(): Promise<MyShiurimData> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { user: null, progressRows: [], savedIds: [], hasAny: false }

  const [progressResult, savedResult] = await Promise.all([
    supabase
      .from('progress')
      .select('lecture_id, position_seconds, completed, last_listened_at, duration_seconds')
      .eq('user_id', user.id)
      .eq('completed', false)
      .gt('position_seconds', 0)
      .order('last_listened_at', { ascending: false })
      .limit(5),
    supabase
      .from('saved_lectures')
      .select('lecture_id')
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false })
      .limit(5),
  ])

  const progressRows = (progressResult.data ?? []) as MyShiurimProgressRow[]
  const savedIds = (savedResult.data ?? []).map((r: { lecture_id: string }) => r.lecture_id)

  return {
    user,
    progressRows,
    savedIds,
    hasAny: progressRows.length > 0 || savedIds.length > 0,
  }
}
