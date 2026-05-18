'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { getLectureDescription } from '@/lib/supabase'
import LecturePlayer from '@/components/player/LecturePlayer'
import DescriptionSection from '@/components/lectures/DescriptionSection'

type Props = {
  lectureId: string
  jsonDescription: string // fallback from lectures.json while Supabase loads
}

// Handles description + player only.
// CommentsSection is rendered separately (after prev/next nav) via CommentsLoader.
export default function LectureAuthSection({ lectureId, jsonDescription }: Props) {
  const [userId, setUserId] = useState<string | undefined>()
  const [description, setDescription] = useState(jsonDescription)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const [{ data: { user } }, dbDescription] = await Promise.all([
        supabase.auth.getUser(),
        getLectureDescription(lectureId),
      ])
      if (dbDescription) setDescription(dbDescription)
      if (user) setUserId(user.id)
    }
    load()
  }, [lectureId])

  return (
    <>
      <DescriptionSection
        lectureId={lectureId}
        initialDescription={description}
        userId={userId}
      />
      <LecturePlayer lectureId={lectureId} userId={userId} />
    </>
  )
}
