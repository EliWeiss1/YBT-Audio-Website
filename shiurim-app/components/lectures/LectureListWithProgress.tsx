'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import LectureCard from './LectureCard'
import { Lecture } from '@/lib/lectures'

type ProgressEntry = {
  position_seconds: number
  completed: boolean
  duration_seconds?: number | null
}
type ProgressMap = Record<string, ProgressEntry>

type Props = {
  lectures: Lecture[]
  nodeId: string
}

export default function LectureListWithProgress({ lectures, nodeId }: Props) {
  const [progressMap, setProgressMap] = useState<ProgressMap>({})

  useEffect(() => {
    async function loadProgress() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase
        .from('progress')
        .select('lecture_id, position_seconds, completed, duration_seconds')
        .eq('user_id', user.id)
      if (data) {
        setProgressMap(
          Object.fromEntries(
            data.map((p: { lecture_id: string } & ProgressEntry) => [p.lecture_id, p])
          )
        )
      }
    }
    loadProgress()
  }, [])

  return (
    <div className="space-y-2">
      {lectures.map((lecture, i) => (
        <LectureCard
          key={`${nodeId}-${lecture.id}`}
          lecture={lecture}
          index={i + 1}
          progress={progressMap[lecture.id]}
        />
      ))}
    </div>
  )
}
