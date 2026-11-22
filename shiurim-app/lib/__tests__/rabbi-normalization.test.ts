import { describe, it, expect } from 'vitest'
import { normalizeRabbi, getRawVariants } from '../rabbi-normalization'

describe('normalizeRabbi — Rabbi Aaron Zimmer', () => {
  it.each([
    'Rabbi Zimmer',
    'Rabbi Aaron Zimmer',
    'Rabbi Aron Zimmer',
    'Rabbi Aharon Zimmer',
    'Rabbi A. Zimmer',
    'Rabbi A Zimmer',
    'Rabbi Zimer',
    'Rabbi Aron Zimer',
    'Rabbi Aaron Zymmer',
    'rabbi aron zimmer',
    'Rav Zimmer',
    '  Rabbi   Zimmer ',
  ])('maps "%s" to the canonical name', (raw) => {
    expect(normalizeRabbi(raw)).toBe('Rabbi Aaron Zimmer')
  })

  it('leaves unrelated rabbis untouched', () => {
    expect(normalizeRabbi('Rabbi Elie Feder')).toBe('Rabbi Elie Feder')
    expect(normalizeRabbi('Rabbi Ben Aaronson')).toBe('Rabbi Ben Aaronson')
    expect(normalizeRabbi('Rabbi David Zimmerman')).toBe('Rabbi David Zimmerman')
  })

  it('still applies existing exact-variant rules', () => {
    expect(normalizeRabbi('Rabbi Yisroel Chait')).toBe('Rabbi Chait')
  })

  it('exposes raw variants for the rabbi page', () => {
    expect(getRawVariants('Rabbi Aaron Zimmer')).toContain('Rabbi Aron Zimmer')
  })
})
