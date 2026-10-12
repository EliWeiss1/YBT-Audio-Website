// Pure, browser-free helpers for the PWA install flow.
// Kept separate from the React context (pwa-install.tsx) so the platform-
// detection and dismissal-suppression rules are unit-testable under Vitest's
// node environment without stubbing window/navigator/matchMedia.

/** localStorage key holding the ms-timestamp of the last explicit banner dismissal. */
export const DISMISS_KEY = 'install-banner-dismissed:v1'

/** How long an explicit dismissal keeps the auto-banner hidden. */
export const REMIND_AFTER_DAYS = 30

export type InstallPlatform = 'android' | 'ios' | 'other'

/** localStorage key set once we positively know the app is installed on this device. */
export const INSTALLED_KEY = 'pwa-installed:v1'

/**
 * True for iOS, which has no native install prompt (manual A2HS only).
 * iPadOS 13+ defaults to "Request Desktop Website" and reports a Macintosh UA,
 * so a Macintosh UA with a touch screen (`maxTouchPoints` > 1) is an iPad —
 * real Macs report 0.
 */
export function isIosUserAgent(userAgent: string, maxTouchPoints: number = 0): boolean {
  if (/iphone|ipad|ipod/i.test(userAgent)) return true
  return /macintosh/i.test(userAgent) && maxTouchPoints > 1
}

/** True for phone/tablet user agents (iOS or Android) — false for desktop/laptop. */
export function isMobileUserAgent(userAgent: string, maxTouchPoints: number = 0): boolean {
  return isIosUserAgent(userAgent, maxTouchPoints) || /android/i.test(userAgent)
}

/**
 * Whether an explicit banner dismissal is still within its remind window.
 * `stored` is the raw localStorage value (ms timestamp, or null/garbage).
 */
export function wasDismissedRecently(
  stored: string | null,
  now: number,
  remindAfterDays: number = REMIND_AFTER_DAYS,
): boolean {
  const at = Number(stored ?? 0)
  if (!Number.isFinite(at) || at <= 0) return false
  return now - at < remindAfterDays * 86_400_000
}

/**
 * Classify the current environment for install-UI purposes.
 * iOS always wins (no native prompt); otherwise a held `beforeinstallprompt`
 * event means Android/desktop native install is available, and its absence
 * means installability is unknown (fall back to manual instructions).
 */
export function resolvePlatform(
  userAgent: string,
  hasDeferredPrompt: boolean,
  maxTouchPoints: number = 0,
): InstallPlatform {
  if (isIosUserAgent(userAgent, maxTouchPoints)) return 'ios'
  return hasDeferredPrompt ? 'android' : 'other'
}

/**
 * Whether to surface any "Install app" affordance.
 *
 * Mobile-only: this is a phone/tablet home-screen affordance, so desktop and
 * laptop user agents never see it.
 *
 * Shown by default on every mobile device and hidden only on positive evidence
 * that the app is already installed (`installed`: running standalone, an
 * `appinstalled` event, or the persisted INSTALLED_KEY flag). There is no
 * reliable way to detect an install from a normal browser tab — iOS exposes
 * nothing, and Chromium's `beforeinstallprompt` is missing on Firefox/Samsung/
 * in-app browsers and can fire before we attach a listener — so absence of
 * evidence must not hide the entry.
 */
export function shouldOfferInstall(installed: boolean, isMobile: boolean): boolean {
  return isMobile && !installed
}
