'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DISMISS_KEY,
  REMIND_AFTER_DAYS,
  isMobileUserAgent,
  resolvePlatform,
  shouldOfferInstall,
  wasDismissedRecently,
  type InstallPlatform,
} from './pwa-install-logic'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type PromptResult = 'accepted' | 'dismissed' | 'unavailable'

type PwaInstallState = {
  /** App is running installed (standalone) — hide all install UI. */
  installed: boolean
  platform: InstallPlatform
  /** A native `beforeinstallprompt` event is held and can be fired. */
  canPrompt: boolean
  /** Fire the native install dialog; 'unavailable' when no prompt is held. */
  promptInstall: () => Promise<PromptResult>
  /** True while an explicit dismissal is still within the remind window. */
  dismissedRecently: boolean
  /** Record an explicit dismissal (× / "Not now") — suppresses the banner. */
  dismissBanner: () => void
  /** Whether any install affordance should be shown at all (mobile-only, not-installed). */
  shouldOffer: boolean
}

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari legacy flag
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}

const PwaInstallContext = createContext<PwaInstallState | null>(null)

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState(false)
  const [canPrompt, setCanPrompt] = useState(false)
  const [dismissedRecently, setDismissedRecently] = useState(false)
  const [userAgent, setUserAgent] = useState('')
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)

  useEffect(() => {
    setUserAgent(navigator.userAgent)
    setInstalled(detectStandalone())
    try {
      setDismissedRecently(wasDismissedRecently(localStorage.getItem(DISMISS_KEY), Date.now()))
    } catch { /* private mode — leave false */ }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setCanPrompt(true)
    }
    const onInstalled = () => {
      deferredPrompt.current = null
      setCanPrompt(false)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<PromptResult> => {
    const evt = deferredPrompt.current
    if (!evt) return 'unavailable'
    await evt.prompt()
    const { outcome } = await evt.userChoice
    // A deferred prompt is single-use; drop it so the UI stops offering it.
    deferredPrompt.current = null
    setCanPrompt(false)
    return outcome
  }, [])

  const dismissBanner = useCallback(() => {
    setDismissedRecently(true)
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()))
    } catch { /* ignore */ }
  }, [])

  const value = useMemo<PwaInstallState>(() => {
    const platform = resolvePlatform(userAgent, canPrompt)
    return {
      installed,
      platform,
      canPrompt,
      promptInstall,
      dismissedRecently,
      dismissBanner,
      shouldOffer: shouldOfferInstall(installed, platform, canPrompt, isMobileUserAgent(userAgent)),
    }
  }, [installed, userAgent, canPrompt, promptInstall, dismissedRecently, dismissBanner])

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>
}

export function usePwaInstall(): PwaInstallState {
  const ctx = useContext(PwaInstallContext)
  if (!ctx) throw new Error('usePwaInstall must be used within a PwaInstallProvider')
  return ctx
}

export { REMIND_AFTER_DAYS }
