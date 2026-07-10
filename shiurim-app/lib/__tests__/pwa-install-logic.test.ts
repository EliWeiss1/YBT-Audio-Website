import { describe, it, expect } from 'vitest'
import {
  isIosUserAgent,
  wasDismissedRecently,
  resolvePlatform,
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
