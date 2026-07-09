'use client'

import { useState } from 'react'

type Props = {
  title: string
}

const ShareIcon = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M12 16V4m0 0L8 8m4-4l4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
)

const CheckIcon = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

export default function ShareButton({ title }: Props) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = window.location.href

    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch {
        // AbortError = user cancelled the share sheet — not an error.
        // Any other failure is also not actionable here, so it's swallowed too.
      }
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write denied/unsupported — no confirmation shown, no error surfaced.
    }
  }

  return (
    <button
      onClick={handleShare}
      title="Share"
      className="rounded-lg p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
    >
      {copied ? <CheckIcon cls="w-5 h-5" /> : <ShareIcon cls="w-5 h-5" />}
    </button>
  )
}
