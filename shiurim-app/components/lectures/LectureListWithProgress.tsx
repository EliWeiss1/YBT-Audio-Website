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
  const [savedSet, setSavedSet]       = useState<Set<string>>(new Set())
  // null = confirmed not logged in; undefined = auth check pending; string = user ID
  const [userId, setUserId]           = useState<string | null | undefined>(undefined)

  useEffect(() => {
    const supabase = createClient()
    const ids = lectures.map(l => l.id)

    async function load() {
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setUserId(null)
        // Still fetch public overrides
        const { data: overrides } = await supabase
          .from('speaker_overrides')
          .select('lecture_id, speaker')
          .in('lecture_id', ids)
        if (overrides) {
          setOverrideMap(
            Object.fromEntries(overrides.map(o => [o.lecture_id, o.speaker]))
          )
        }
        return
      }

      // Authenticated: fetch progress, overrides, and saved set in parallel
      const [progressResult, overridesResult, savedResult] = await Promise.all([
        supabase
          .from('progress')
          .select('lecture_id, position_seconds, completed, duration_seconds')
          .eq('user_id', user.id),
        supabase
          .from('speaker_overrides')
          .select('lecture_id, speaker')
          .in('lecture_id', ids),
        supabase
          .from('saved_lectures')
          .select('lecture_id')
          .eq('user_id', user.id)
          .in('lecture_id', ids),
      ])

      setUserId(user.id)

      if (progressResult.data) {
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

      if (savedResult.data) {
        setSavedSet(new Set(savedResult.data.map(r => r.lecture_id)))
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
          userId={userId}
          saved={savedSet.has(lecture.id)}
        />
      ))}
    </div>
  )
}
