import { describe, it, expect } from 'vitest'
import {
  isIosUserAgent,
  isMobileUserAgent,
  wasDismissedRecently,
  resolvePlatform,
  shouldOfferInstall,
  REMIND_AFTER_DAYS,
} from '../pwa-install-logic'

describe('isIosUserAgent', () => {
  it('detects iPhone / iPad / iPod', () => {
    expect(isIosUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(true)
    expect(isIosUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe(true)
    expect(isIosUserAgent('Mozilla/5.0 (iPod touch; CPU iPhone OS 15_0)')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isIosUserAgent('something IPHONE something')).toBe(true)
  })

  it('returns false for Android and desktop', () => {
    expect(isIosUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(false)
    expect(isIosUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
  })

  it('returns false for empty/missing user agent', () => {
    expect(isIosUserAgent('')).toBe(false)
  })
})

describe('isMobileUserAgent', () => {
  it('detects iOS devices as mobile', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe(true)
    expect(isMobileUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe(true)
  })

  it('detects Android phones/tablets as mobile', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe(true)
  })

  it('is case-insensitive', () => {
    expect(isMobileUserAgent('something ANDROID something Mobile')).toBe(true)
  })

  it('returns false for desktop Windows/Mac/Linux user agents', () => {
    expect(isMobileUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(false)
    expect(isMobileUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(false)
    expect(isMobileUserAgent('Mozilla/5.0 (X11; Linux x86_64)')).toBe(false)
  })

  it('returns false for empty/missing user agent', () => {
    expect(isMobileUserAgent('')).toBe(false)
  })
})

describe('wasDismissedRecently', () => {
  const now = 1_000_000_000_000

  it('returns false when nothing was ever stored', () => {
    expect(wasDismissedRecently(null, now)).toBe(false)
  })

  it('returns false for the sentinel "0"', () => {
    expect(wasDismissedRecently('0', now)).toBe(false)
  })

  it('returns true when dismissed within the remind window', () => {
    const oneDayAgo = now - 1 * 86_400_000
    expect(wasDismissedRecently(String(oneDayAgo), now)).toBe(true)
  })

  it('returns false once the remind window has elapsed', () => {
    const longAgo = now - (REMIND_AFTER_DAYS + 1) * 86_400_000
    expect(wasDismissedRecently(String(longAgo), now)).toBe(false)
  })

  it('treats the boundary as still-suppressed just before expiry', () => {
    const justUnder = now - (REMIND_AFTER_DAYS * 86_400_000 - 1)
    expect(wasDismissedRecently(String(justUnder), now)).toBe(true)
  })

  it('returns false for a malformed value', () => {
    expect(wasDismissedRecently('not-a-number', now)).toBe(false)
  })

  it('honours a custom remind window', () => {
    const twoDaysAgo = now - 2 * 86_400_000
    expect(wasDismissedRecently(String(twoDaysAgo), now, 1)).toBe(false)
    expect(wasDismissedRecently(String(twoDaysAgo), now, 7)).toBe(true)
  })
})

describe('resolvePlatform', () => {
  it('is "ios" for an iOS user agent regardless of deferred prompt', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)'
    expect(resolvePlatform(ua, false)).toBe('ios')
    expect(resolvePlatform(ua, true)).toBe('ios')
  })

  it('is "android" when a deferred prompt is available on non-iOS', () => {
    expect(resolvePlatform('Mozilla/5.0 (Linux; Android 14)', true)).toBe('android')
  })

  it('is "other" on non-iOS with no deferred prompt (unknown installability)', () => {
    expect(resolvePlatform('Mozilla/5.0 (Windows NT 10.0)', false)).toBe('other')
  })
})

describe('shouldOfferInstall', () => {
  it('never offers when already running installed (standalone)', () => {
    expect(shouldOfferInstall(true, 'ios', false, true)).toBe(false)
    expect(shouldOfferInstall(true, 'android', true, true)).toBe(false)
    expect(shouldOfferInstall(true, 'other', false, true)).toBe(false)
  })

  it('offers on iOS when not standalone (no API to detect home-screen install)', () => {
    expect(shouldOfferInstall(false, 'ios', false, true)).toBe(true)
  })

  it('offers on mobile non-iOS only while a native prompt is held', () => {
    // A held prompt means Chromium considers it not-yet-installed.
    expect(shouldOfferInstall(false, 'android', true, true)).toBe(true)
  })

  it('does NOT offer on mobile non-iOS without a prompt — the app is likely already installed', () => {
    // Chromium suppresses beforeinstallprompt once the PWA is installed, so a
    // browser tab of an installed app lands here and must stay quiet.
    expect(shouldOfferInstall(false, 'other', false, true)).toBe(false)
    expect(shouldOfferInstall(false, 'android', false, true)).toBe(false)
  })

  it('never offers on desktop/laptop, even with a held prompt or iOS-like UA', () => {
    // Desktop Chrome/Edge fire beforeinstallprompt too, but this is a
    // mobile-only affordance — laptops never see the install entry.
    expect(shouldOfferInstall(false, 'android', true, false)).toBe(false)
    expect(shouldOfferInstall(false, 'other', false, false)).toBe(false)
    expect(shouldOfferInstall(false, 'ios', false, false)).toBe(false)
  })
})
