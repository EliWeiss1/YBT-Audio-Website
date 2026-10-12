import { describe, it, expect, vi } from 'vitest'
import { categorize, categorizeSafe } from '../categorizer'

// The Haiku call fails the way it does when the Anthropic credit balance runs out.
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: vi.fn().mockRejectedValue(new Error('400 Your credit balance is too low')),
      },
    }
  }),
}))

describe('Kisuy Hadam rule', () => {
  it.each([
    'Kisuy Hadam - Dam HaNitaz and Bilah',
    'Kisuy Hadam - Tosfos Tzarich Sheyitain',
    'kisuy hadam tosfos bimukdashin',
    'Kisui HaDam - Tosfos Mzuman',
  ])('files "%s" under gemarah/chulin without calling Haiku', async (title) => {
    const r = await categorize(title, '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['gemarah', 'chulin'])
    expect(r.confidence).toBe('high')
  })

  it('does not match unrelated titles', async () => {
    const r = await categorizeSafe('Hadam Rishon and the Creation', '')
    expect(r.nodePath).toEqual(['misc', 'misc-general']) // fell through to (mock-failing) Haiku
  })
})

describe('categorizeSafe', () => {
  it('falls back to a flagged Misc placement when the Haiku call throws', async () => {
    // No daf number / masechta, so this reaches tier 2 (Haiku).
    const r = await categorizeSafe('Understanding Emunah and Bitachon', '')
    expect(r.tier).toBe(2)
    expect(r.nodePath).toEqual(['misc', 'misc-general'])
    expect(r.confidence).toBe('low') // low → the route files an /admin/flags entry
  })

  it('still uses tier 1 without calling Haiku when a daf matches', async () => {
    const r = await categorizeSafe('Pesachim 12b', '')
    expect(r.tier).toBe(1)
    expect(r.nodePath).toEqual(['gemarah', 'pesachim'])
  })
})
