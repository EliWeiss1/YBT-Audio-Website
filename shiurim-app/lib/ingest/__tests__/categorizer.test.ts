import { describe, it, expect, vi, beforeEach } from 'vitest'
import { categorize } from '../categorizer'

// Mock Anthropic SDK — tier-2 tests validate the call shape, not real API
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: JSON.stringify({
            proposed_path: ['halacha', 'general-halacha'],
            confidence: 'low',
            alternatives: [['musar', 'general-musar']],
          })}],
        }),
      },
    }
  }),
}))

describe('categorize — Tier 1 (Gemara regex)', () => {
  it('matches "Bava Kamma 34a — Damages for Fire"', async () => {
    const r = await categorize('Bava Kamma 34a — Damages for Fire', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['gemarah', 'baba-kama'])
    expect(r.confidence).toBe('high')
  })

  it('matches "Pesachim 12b"', async () => {
    const r = await categorize('Pesachim 12b', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['gemarah', 'pesachim'])
  })

  it('matches "Shabbos 10a — Kavod Shabbat"', async () => {
    const r = await categorize('Shabbos 10a — Kavod Shabbat', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['gemarah', 'shabbos-gemarah'])
  })

  it('matches multi-word masechta "Rosh Hashana 2a"', async () => {
    const r = await categorize('Rosh Hashana 2a', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['gemarah', 'rosh-hashana-gemarah'])
  })

  it('matches "Bava Batra 2b — Partners in Property"', async () => {
    const r = await categorize('Bava Batra 2b — Partners in Property', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['gemarah', 'gemarah-bava-batra'])
  })

  it('does NOT match a non-Gemara title', async () => {
    const r = await categorize('Introduction to Tefillah', '')
    expect(r.tier).toBe(2)
  })

  it('does NOT match "Shabbat" alone without a daf number', async () => {
    const r = await categorize('Shabbat Laws Overview', '')
    expect(r.tier).toBe(2)
  })

  it('routes "Pirkei Avot" titles to Kisvei Chazal, not the bare "Avot" gemara alias', async () => {
    // Regression: "avot" is a Tier-1 masechta alias for gemarah/other-gemarah, and the
    // chapter/mishna numbers in a Pirkei Avot title (e.g. "Chapter 2 Mishna 10") were
    // matching DAF_RE, so this was misrouted to Gemara instead of its dedicated node.
    const r = await categorize('Pirkei Avot - Chapter 2 Mishna 10 - Honor Anger and Death (Masoret)', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['kisvei-chazal', 'kisvei-chazal-all'])
    expect(r.confidence).toBe('high')
  })

  it('routes the Ashkenazi "Pirkei Avos" spelling the same way', async () => {
    const r = await categorize('Pirkei Avos Perek 3 - Money and Honor', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['kisvei-chazal', 'kisvei-chazal-all'])
  })
})

describe('categorize — Tier 2 (Haiku fallback)', () => {
  it('calls Anthropic and returns structured result', async () => {
    const r = await categorize('Introduction to Tefillah', 'Overview of prayer laws')
    expect(r.tier).toBe(2)
    expect(r.nodePath).toEqual(['halacha', 'general-halacha'])
    expect('confidence' in r && r.confidence).toBe('low')
  })
})
