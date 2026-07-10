'use client'

import { useState } from 'react'
import { usePwaInstall } from '@/lib/pwa-install'
import InstallInstructions from './InstallInstructions'

/** Persistent, quiet "Install app" entry in the sidebar nav. Mobile-only,
 *  hidden once the app is installed (see shouldOfferInstall). Fires the
 *  native prompt when one is held, otherwise falls back to manual instructions. */
export default function InstallSidebarItem() {
  const { shouldOffer, platform, canPrompt, promptInstall } = usePwaInstall()
  const [showInstructions, setShowInstructions] = useState(false)

  if (!shouldOffer) return null

  const handleClick = async () => {
    if (canPrompt) {
      const result = await promptInstall()
      // If the browser had nothing to show, fall back to instructions.
      if (result === 'unavailable') setShowInstructions(true)
      return
    }
    setShowInstructions(true)
  }

  return (
    <>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
      >
        <span>⬇️</span> Install app
        <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100 rounded-full px-1.5 py-0.5 leading-none">
          app
        </span>
      </button>

      {showInstructions && (
        <InstallInstructions platform={platform} onClose={() => setShowInstructions(false)} />
      )}
    </>
  )
}
