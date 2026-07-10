// Pure, browser-free helpers for the PWA install flow.
// Kept separate from the React context (pwa-install.tsx) so the platform-
// detection and dismissal-suppression rules are unit-testable under Vitest's
// node environment without stubbing window/navigator/matchMedia.

/** localStorage key holding the ms-timestamp of the last explicit banner dismissal. */
export const DISMISS_KEY = 'install-banner-dismissed:v1'

/** How long an explicit dismissal keeps the auto-banner hidden. */
export const REMIND_AFTER_DAYS = 30

export type InstallPlatform = 'android' | 'ios' | 'other'

/** True for iOS Safari, which has no native install prompt (manual A2HS only). */
export function isIosUserAgent(userAgent: string): boolean {
  return /iphone|ipad|ipod/i.test(userAgent)
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
export function resolvePlatform(userAgent: string, hasDeferredPrompt: boolean): InstallPlatform {
  if (isIosUserAgent(userAgent)) return 'ios'
  return hasDeferredPrompt ? 'android' : 'other'
}

/**
 * Whether to surface any "Install app" affordance.
 *
 * Never when already installed (standalone). On iOS there's no API to tell
 * whether the site is already on the home screen, so we offer whenever not
 * standalone. On Chromium (Android/desktop) `beforeinstallprompt` stops firing
 * once the PWA is installed, so a held prompt (`canPrompt`) is our signal that
 * it isn't installed yet — no prompt means we stay quiet rather than nag a user
 * who already has the app.
 */
export function shouldOfferInstall(
  installed: boolean,
  platform: InstallPlatform,
  canPrompt: boolean,
): boolean {
  if (installed) return false
  if (platform === 'ios') return true
  return canPrompt
}
