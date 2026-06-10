'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import { usePlayer } from '@/lib/player-context'

const DISMISS_KEY = 'install-banner-dismissed:v1'
const REMIND_AFTER_DAYS = 30

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isStandalone(): boolean {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari legacy flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
}

function wasDismissedRecently(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0)
    return at > 0 && Date.now() - at < REMIND_AFTER_DAYS * 86_400_000
  } catch {
    return false
  }
}

/** "Install the app" prompt: native install on Android/Chrome,
 *  Add-to-Home-Screen instructions on iOS Safari. */
export default function InstallBanner() {
  const { lecture } = usePlayer()
  const [mode, setMode] = useState<'hidden' | 'android' | 'ios'>('hidden')
  const [visible, setVisible] = useState(false) // drives the slide-up animation
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    if (isStandalone() || wasDismissedRecently()) return

    let showTimer: ReturnType<typeof setTimeout> | null = null
    const reveal = (m: 'android' | 'ios') => {
      setMode(m)
      // Slight delay so the banner slides in after the page settles
      showTimer = setTimeout(() => setVisible(true), 2500)
    }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      setPromptEvent(e as BeforeInstallPromptEvent)
      reveal('android')
    }
    window.addEventListener('beforeinstallprompt', onPrompt)

    if (isIos()) reveal('ios')

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      if (showTimer) clearTimeout(showTimer)
    }
  }, [])

  const dismiss = () => {
    setVisible(false)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch { /* ignore */ }
  }

  const install = async () => {
    if (!promptEvent) return
    setVisible(false)
    await promptEvent.prompt()
    const { outcome } = await promptEvent.userChoice
    if (outcome === 'dismissed') {
      try { localStorage.setItem(DISMISS_KEY, String(Date.now())) } catch { /* ignore */ }
    }
  }

  if (mode === 'hidden') return null

  return (
    <div
      className={`fixed inset-x-0 z-40 px-3 transition-all duration-500 ease-out
        ${visible ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0 pointer-events-none'}`}
      // Sit above the bottom player when audio is active
      style={{ bottom: lecture ? 'calc(110px + env(safe-area-inset-bottom))' : 'calc(12px + env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-md mx-auto rounded-2xl bg-white border border-stone-200 shadow-xl shadow-stone-900/10 p-4">
        <div className="flex items-start gap-3">
          <Image
            src="/icons/icon-192.png"
            alt=""
            width={44}
            height={44}
            className="rounded-xl border border-stone-100 shrink-0"
            unoptimized
          />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-stone-900 leading-tight">
              Get the YBT Shiurim app
            </p>
            {mode === 'android' ? (
              <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                Install it on your home screen — full screen, with offline downloads.
              </p>
            ) : (
              <p className="text-xs text-stone-500 mt-0.5 leading-relaxed">
                Tap{' '}
                <svg className="inline w-3.5 h-3.5 -mt-0.5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v12m0-12L8 7m4-4l4 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                </svg>{' '}
                <span className="font-medium text-stone-700">Share</span>, then{' '}
                <span className="font-medium text-stone-700">&ldquo;Add to Home Screen&rdquo;</span>{' '}
                to install it with offline downloads.
              </p>
            )}
          </div>
          <button
            onClick={dismiss}
            className="shrink-0 p-1.5 -m-1 rounded-lg text-stone-300 hover:text-stone-500 hover:bg-stone-50 transition-colors"
            aria-label="Dismiss"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {mode === 'android' && (
          <div className="flex gap-2 mt-3">
            <button
              onClick={install}
              className="flex-1 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-sm font-semibold transition-colors"
            >
              Install
            </button>
            <button
              onClick={dismiss}
              className="px-4 py-2 rounded-lg text-sm font-medium text-stone-500 hover:bg-stone-50 transition-colors"
            >
              Not now
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
