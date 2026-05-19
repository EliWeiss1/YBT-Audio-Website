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
type OverrideMap = Record<string, string>

type Props = {
  lectures: Lecture[]
  nodeId: string
}

export default function LectureListWithProgress({ lectures, nodeId }: Props) {
  const [progressMap, setProgressMap] = useState<ProgressMap>({})
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})

  useEffect(() => {
    const supabase = createClient()
    const ids = lectures.map(l => l.id)

    // Fetch progress (auth-gated) and speaker overrides (public) in parallel
    async function load() {
      const [progressResult, overridesResult] = await Promise.all([
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return null
          return supabase
            .from('progress')
            .select('lecture_id, position_seconds, completed, duration_seconds')
            .eq('user_id', user.id)
        }),
        supabase
          .from('speaker_overrides')
          .select('lecture_id, speaker')
          .in('lecture_id', ids),
      ])

      if (progressResult && 'data' in progressResult && progressResult.data) {
        setProgressMap(
          Object.fromEntries(
            progressResult.data.map(
              (p: { lecture_id: string } & ProgressEntry) => [p.lecture_id, p]
            )
          )
        )
      }

      if (overridesResult.data) {
        setOverrideMap(
          Object.fromEntries(
            overridesResult.data.map(
              (o: { lecture_id: string; speaker: string }) => [o.lecture_id, o.speaker]
            )
          )
        )
      }
    }

    load()
  }, [nodeId]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="space-y-2">
      {lectures.map((lecture, i) => (
        <LectureCard
          key={`${nodeId}-${lecture.id}`}
          lecture={lecture}
          index={i + 1}
          progress={progressMap[lecture.id]}
          speakerOverride={overrideMap[lecture.id]}
        />
      ))}
    </div>
  )
}
