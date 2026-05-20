'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { saveLecture, unsaveLecture } from '@/lib/supabase'

type Props = {
  lectureId: string
  /**
   * userId behaviour:
   *   undefined  → self-fetch auth + saved status (lecture detail page)
   *   null       → explicitly not logged in — show greyed icon, no fetch
   *   string     → logged-in user ID — use initialSaved, no fetch
   */
  userId?: string | null
  initialSaved?: boolean
  size?: 'sm' | 'md'
}

// Bookmark SVG paths (simple pointed bookmark shape)
const BookmarkOutline = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z" />
  </svg>
)

const BookmarkFilled = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="currentColor" viewBox="0 0 24 24">
    <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z" />
  </svg>
)

export default function BookmarkButton({
  lectureId,
  userId: userIdProp,
  initialSaved,
  size = 'sm',
}: Props) {
  // resolvedUserId: undefined = pending, null = not logged in, string = logged in
  const [resolvedUserId, setResolvedUserId] = useState<string | null | undefined>(
    userIdProp === undefined ? undefined : userIdProp
  )
  const [saved, setSaved] = useState<boolean>(initialSaved ?? false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (userIdProp !== undefined) {
      // Props explicitly provided by parent — sync internal state, no network call
      setResolvedUserId(userIdProp)
      setSaved(initialSaved ?? false)
      return
    }
    // Self-fetch mode: used on the lecture detail page
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) {
        setResolvedUserId(null)
        return
      }
      setResolvedUserId(user.id)
      supabase
        .from('saved_lectures')
        .select('lecture_id')
        .eq('user_id', user.id)
        .eq('lecture_id', lectureId)
        .maybeSingle()
        .then(({ data }) => setSaved(!!data))
    })
  }, [lectureId, userIdProp, initialSaved])

  const toggle = async () => {
    if (!resolvedUserId || loading) return
    setLoading(true)
    const next = !saved
    setSaved(next) // optimistic update
    try {
      if (next) {
        await saveLecture(resolvedUserId, lectureId)
      } else {
        await unsaveLecture(resolvedUserId, lectureId)
      }
    } catch {
      setSaved(!next) // revert on error
    } finally {
      setLoading(false)
    }
  }

  const iconCls = size === 'md' ? 'w-5 h-5' : 'w-4 h-4'

  // Not logged in or auth still resolving — greyed out, no interaction
  if (!resolvedUserId) {
    return (
      <button
        disabled
        title="Sign in to save for later"
        className={`rounded-lg text-stone-300 cursor-default transition-colors
          ${size === 'md' ? 'p-1.5' : 'p-1'}`}
      >
        <BookmarkOutline cls={iconCls} />
      </button>
    )
  }

  // Saved state — green filled bookmark + "Saved" label
  if (saved) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        title="Saved — click to remove"
        className={`flex items-center gap-1 rounded-lg text-emerald-700
          hover:bg-emerald-50 transition-colors disabled:opacity-50
          ${size === 'md' ? 'px-2 py-1.5' : 'px-1.5 py-1'}`}
      >
        <BookmarkFilled cls={iconCls} />
        <span className={`font-medium ${size === 'md' ? 'text-sm' : 'text-xs'}`}>
          Saved
        </span>
      </button>
    )
  }

  // Unsaved state — outline bookmark
  return (
    <button
      onClick={toggle}
      disabled={loading}
      title="Save for later"
      className={`rounded-lg text-stone-400 hover:text-stone-600
        hover:bg-stone-100 transition-colors disabled:opacity-50
        ${size === 'md' ? 'p-1.5' : 'p-1'}`}
    >
      <BookmarkOutline cls={iconCls} />
    </button>
  )
}
