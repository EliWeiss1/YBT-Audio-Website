import { describe, it, expect, vi } from 'vitest'
import {
  categorizeDrive, pinPlacement, keywordChild, rabbiFallback, pathToNode,
} from '../drive-categorizer'
import folderHierarchy from '@/data/folder-hierarchy.json'

// Mock Anthropic — tier-2 tests control what the model "returns".
const haikuText = vi.fn()
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(function () {
    return { messages: { create: vi.fn().mockImplementation(async () => ({ content: [{ type: 'text', text: haikuText() }] })) } }
  }),
}))

const gemarah = (folderHierarchy as { categories: Array<{ id: string; label: string; children?: unknown[] }> })
  .categories.find(c => c.id === 'gemarah') as { id: string; label: string; children: { id: string; label: string }[] }

describe('pinPlacement', () => {
  it('treats a top-level category as a sub-categorization target', () => {
    const p = pinPlacement('gemarah')
    expect(p.direct).toBeUndefined()
    expect(p.category?.id).toBe('gemarah')
  })
  it('treats a specific deep node as a direct placement', () => {
    expect(pinPlacement('kisvei-rishonim-rambam-perek-chelek').direct)
      .toEqual(['kisvei-rishonim', 'kisvei-rishonim-rambam', 'kisvei-rishonim-rambam-perek-chelek'])
  })
  it('returns nothing for an unknown pin', () => {
    expect(pinPlacement('does-not-exist')).toEqual({})
  })
})

describe('pathToNode', () => {
  it('finds the ancestor chain of a deep node', () => {
    expect(pathToNode('gemarah-megillah')?.map(n => n.id)).toEqual(['gemarah', 'gemarah-megillah'])
  })
})

describe('keywordChild', () => {
  it('matches a sub-topic label appearing in the title', () => {
    expect(keywordChild('Megillah Pirsumei Nisah', gemarah)).toBe('gemarah-megillah')
  })
  it('returns null when no sub-topic label appears', () => {
    expect(keywordChild('YomTov11', gemarah)).toBeNull()
  })
})

describe('rabbiFallback', () => {
  it('builds a per-rabbi leaf under the category with a label', () => {
    expect(rabbiFallback('gemarah', 'Rabbi Bald')).toEqual({
      nodePath: ['gemarah', 'gemarah-rabbi-bald'],
      nodeLabel: 'Rabbi Bald',
      confidence: 'low',
      tier: 'rabbi-fallback',
    })
  })
})

describe('categorizeDrive', () => {
  it('places directly at a specific-node pin (no AI call)', async () => {
    const r = await categorizeDrive('anything', 'kisvei-rishonim-rambam-perek-chelek', 'Rabbi Zemel')
    expect(r).toMatchObject({
      nodePath: ['kisvei-rishonim', 'kisvei-rishonim-rambam', 'kisvei-rishonim-rambam-perek-chelek'],
      tier: 'pinned',
    })
    expect(r.nodeLabel).toBeUndefined()
  })

  it('honors a folder alias before anything else (yomtov → gemarah-beitza)', async () => {
    const r = await categorizeDrive('YomTov11', 'gemarah', 'Rabbi Bald', { yomtov: 'gemarah-beitza' })
    expect(r).toMatchObject({ nodePath: ['gemarah', 'gemarah-beitza'], tier: 'alias' })
  })

  it('keyword-matches a sub-topic within a top-level category pin (Tier 1, no AI)', async () => {
    const r = await categorizeDrive('Megillah Pirsumei Nisah', 'gemarah', 'Rabbi Bald')
    expect(r).toMatchObject({ nodePath: ['gemarah', 'gemarah-megillah'], tier: 1 })
  })

  it('uses the AI pick when confident (Tier 2)', async () => {
    haikuText.mockReturnValueOnce(JSON.stringify({ child_id: 'pesachim', confidence: 'high' }))
    const r = await categorizeDrive('Afikoman02', 'gemarah', 'Rabbi Bald')
    expect(r).toMatchObject({ nodePath: ['gemarah', 'pesachim'], tier: 2 })
  })

  it('falls back to a per-rabbi folder when the AI is unsure', async () => {
    haikuText.mockReturnValueOnce(JSON.stringify({ child_id: 'none', confidence: 'low' }))
    const r = await categorizeDrive('YomTov11', 'gemarah', 'Rabbi Bald')
    expect(r).toMatchObject({
      nodePath: ['gemarah', 'gemarah-rabbi-bald'],
      nodeLabel: 'Rabbi Bald',
      tier: 'rabbi-fallback',
    })
  })

  it('rejects a hallucinated child id and falls back', async () => {
    haikuText.mockReturnValueOnce(JSON.stringify({ child_id: 'not-a-real-child', confidence: 'high' }))
    const r = await categorizeDrive('Something', 'gemarah', 'Rabbi Bald')
    expect(r.tier).toBe('rabbi-fallback')
  })
})
