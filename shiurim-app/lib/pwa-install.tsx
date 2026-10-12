'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  DISMISS_KEY,
  INSTALLED_KEY,
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

/** How long a tap waits for a not-yet-delivered beforeinstallprompt before giving up. */
const PROMPT_WAIT_MS = 1500

declare global {
  interface Window {
    /** Set by the beforeinstallprompt listener in app/layout.tsx, which runs before hydration. */
    __deferredInstallPrompt?: Event
  }
}

function setInstalledFlag(on: boolean) {
  try {
    if (on) localStorage.setItem(INSTALLED_KEY, '1')
    else localStorage.removeItem(INSTALLED_KEY)
  } catch { /* private mode — ignore */ }
}

function readInstalledFlag(): boolean {
  try {
    return localStorage.getItem(INSTALLED_KEY) === '1'
  } catch {
    return false
  }
}

const PwaInstallContext = createContext<PwaInstallState | null>(null)

export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const [installed, setInstalled] = useState(false)
  const [canPrompt, setCanPrompt] = useState(false)
  const [dismissedRecently, setDismissedRecently] = useState(false)
  const [userAgent, setUserAgent] = useState('')
  const [maxTouchPoints, setMaxTouchPoints] = useState(0)
  const deferredPrompt = useRef<BeforeInstallPromptEvent | null>(null)
  // Callbacks waiting for a late beforeinstallprompt (see promptInstall).
  const promptWaiters = useRef<Array<() => void>>([])

  useEffect(() => {
    setUserAgent(navigator.userAgent)
    setMaxTouchPoints(navigator.maxTouchPoints ?? 0)
    // Standalone = definitely installed; remember it so a later visit in a
    // normal browser tab on this device (shared storage on Android) also knows.
    const standalone = detectStandalone()
    if (standalone) setInstalledFlag(true)
    setInstalled(standalone || readInstalledFlag())

    // The browser may have fired beforeinstallprompt before React hydrated;
    // the inline listener in layout.tsx stashed it for us.
    if (window.__deferredInstallPrompt) {
      deferredPrompt.current = window.__deferredInstallPrompt as BeforeInstallPromptEvent
      setCanPrompt(true)
    }
    try {
      setDismissedRecently(wasDismissedRecently(localStorage.getItem(DISMISS_KEY), Date.now()))
    } catch { /* private mode — leave false */ }

    const onPrompt = (e: Event) => {
      e.preventDefault()
      deferredPrompt.current = e as BeforeInstallPromptEvent
      setCanPrompt(true)
      promptWaiters.current.splice(0).forEach((resolve) => resolve())
      // Chromium only fires this when the app is NOT installed, so any
      // earlier "installed" flag is stale (e.g. the user uninstalled it).
      setInstalledFlag(false)
      setInstalled(detectStandalone())
    }
    const onInstalled = () => {
      deferredPrompt.current = null
      window.__deferredInstallPrompt = undefined
      setCanPrompt(false)
      setInstalledFlag(true)
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
    // Chromium may still be about to hand us the event (tap right after load):
    // wait briefly so the tap installs instead of falling back to instructions.
    // Browsers without the API (iOS Safari, Firefox) never send one — don't wait.
    if (!deferredPrompt.current && 'onbeforeinstallprompt' in window) {
      await new Promise<void>((resolve) => {
        const done = () => { clearTimeout(timer); resolve() }
        const timer = setTimeout(() => {
          promptWaiters.current = promptWaiters.current.filter((w) => w !== done)
          resolve()
        }, PROMPT_WAIT_MS)
        promptWaiters.current.push(done)
      })
    }
    const evt = deferredPrompt.current
    if (!evt) return 'unavailable'
    await evt.prompt()
    const { outcome } = await evt.userChoice
    // A deferred prompt is single-use; drop it so the UI stops offering the
    // native dialog (the sidebar entry stays, falling back to instructions).
    deferredPrompt.current = null
    window.__deferredInstallPrompt = undefined
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
    const platform = resolvePlatform(userAgent, canPrompt, maxTouchPoints)
    return {
      installed,
      platform,
      canPrompt,
      promptInstall,
      dismissedRecently,
      dismissBanner,
      shouldOffer: shouldOfferInstall(installed, isMobileUserAgent(userAgent, maxTouchPoints)),
    }
  }, [installed, userAgent, maxTouchPoints, canPrompt, promptInstall, dismissedRecently, dismissBanner])

  return <PwaInstallContext.Provider value={value}>{children}</PwaInstallContext.Provider>
}

export function usePwaInstall(): PwaInstallState {
  const ctx = useContext(PwaInstallContext)
  if (!ctx) throw new Error('usePwaInstall must be used within a PwaInstallProvider')
  return ctx
}

export { REMIND_AFTER_DAYS }
