'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getLectureComments } from '@/lib/supabase'
import CommentsSection from '@/components/discussions/CommentsSection'

type Comment = {
  id: string
  user_id: string
  body: string
  parent_id: string | null
  created_at: string
  profiles: { display_name: string; username: string; avatar_url: string | null }
}

type Props = {
  lectureId: string
}

// Fetches auth + comments client-side so the lecture page shell can be cached.
// Renders a skeleton until data is ready to avoid the "No comments yet" flash.
export default function CommentsLoader({ lectureId }: Props) {
  const [userId, setUserId] = useState<string | undefined>()
  const [userDisplayName, setUserDisplayName] = useState<string | undefined>()
  const [comments, setComments] = useState<Comment[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: { user } }, commentsData] = await Promise.all([
        supabase.auth.getUser(),
        getLectureComments(lectureId),
      ])
      setComments(commentsData)
      if (user) {
        setUserId(user.id)
        setUserDisplayName(user.user_metadata?.full_name)
      }
      setReady(true)
    }
    load()
  }, [lectureId])

  if (!ready) {
    return (
      <div className="mt-2">
        <h2 className="text-xl font-bold text-stone-900 mb-6 flex items-center gap-2">
          💬 Discussion
          <span className="text-sm font-normal text-stone-400 animate-pulse">Loading...</span>
        </h2>
      </div>
    )
  }

  return (
    <CommentsSection
      lectureId={lectureId}
      initialComments={comments}
      userId={userId}
      userDisplayName={userDisplayName}
    />
  )
}
