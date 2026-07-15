'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { isAppLoaded } from '@/lib/app-session'

const BackIcon = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

// Shared classes so the router.back() button and the <Link> fallback render identically.
const backLinkClasses =
  'inline-flex items-center gap-1.5 -ml-1.5 pl-1.5 pr-3 py-2 min-h-[44px] rounded-lg ' +
  'text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors'

export default function BackButton() {
  const router = useRouter()
  // Defaults false during SSR/first paint (no `window`), then flips true on mount
  // if the app shell had already loaded before this page — see lib/app-session.ts.
  // A directly-opened/shared link is the first thing to mount in its tab, so this
  // stays false and the component falls back to a plain link instead of calling
  // router.back() into a dead end.
  const [hasHistory, setHasHistory] = useState(false)

  useEffect(() => {
    setHasHistory(isAppLoaded())
  }, [])

  if (hasHistory) {
    return (
      <button onClick={() => router.back()} className={backLinkClasses}>
        <BackIcon cls="w-4 h-4" />
        Back
      </button>
    )
  }

  return (
    <Link href="/lectures" className={backLinkClasses}>
      <BackIcon cls="w-4 h-4" />
      Back
    </Link>
  )
}
