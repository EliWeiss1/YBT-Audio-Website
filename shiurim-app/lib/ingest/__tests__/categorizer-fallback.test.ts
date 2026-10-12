import { describe, it, expect, vi } from 'vitest'
import { categorizeSafe } from '../categorizer'

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

describe('categorizeSafe', () => {
  it('falls back to a flagged Misc placement when the Haiku call throws', async () => {
    // No daf number / masechta, so this reaches tier 2 (Haiku).
    const r = await categorizeSafe('Kisuy Hadam - Dam HaNitaz and Bilah', '')
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
