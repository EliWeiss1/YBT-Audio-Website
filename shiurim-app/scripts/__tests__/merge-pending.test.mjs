import { describe, it, expect } from 'vitest'
import { resolvePlacement } from '../lib/merge-pending.mjs'

// Minimal tree mirroring the real shape: branches have children, leaves have lectures.
function tree() {
  return [
    { id: 'gemarah', label: 'Gemarah', children: [
      { id: 'gemarah-megillah', label: 'Megillah', lectures: [] },
      { id: 'pesachim', label: 'Pesachim', lectures: [] },
    ] },
    { id: 'kisvei-rishonim', label: 'Kisvei Rishonim', children: [
      { id: 'kisvei-rishonim-rambam', label: 'Rambam', children: [
        { id: 'kisvei-rishonim-rambam-perek-chelek', label: 'Perek Chelek', lectures: [] },
      ] },
    ] },
  ]
}

describe('resolvePlacement', () => {
  it('resolves an existing 2-level path', () => {
    const t = tree()
    expect(resolvePlacement(t, ['gemarah', 'gemarah-megillah']).id).toBe('gemarah-megillah')
  })

  it('resolves an existing deep (3-level) path', () => {
    const t = tree()
    const node = resolvePlacement(t, ['kisvei-rishonim', 'kisvei-rishonim-rambam', 'kisvei-rishonim-rambam-perek-chelek'])
    expect(node.id).toBe('kisvei-rishonim-rambam-perek-chelek')
  })

  it('creates a per-rabbi leaf under the category when given a label', () => {
    const t = tree()
    const node = resolvePlacement(t, ['gemarah', 'gemarah-rabbi-bald'], 'Rabbi Bald')
    expect(node).toMatchObject({ id: 'gemarah-rabbi-bald', label: 'Rabbi Bald' })
    // it was actually attached to the tree
    expect(t[0].children.some(c => c.id === 'gemarah-rabbi-bald')).toBe(true)
  })

  it('reuses the created node on a second placement (idempotent within a build)', () => {
    const t = tree()
    resolvePlacement(t, ['gemarah', 'gemarah-rabbi-bald'], 'Rabbi Bald')
    resolvePlacement(t, ['gemarah', 'gemarah-rabbi-bald'], 'Rabbi Bald')
    expect(t[0].children.filter(c => c.id === 'gemarah-rabbi-bald')).toHaveLength(1)
  })

  it('degrades to the nearest ancestor when a sub is missing and no label is given', () => {
    const t = tree()
    expect(resolvePlacement(t, ['gemarah', 'nonexistent-sub']).id).toBe('gemarah')
  })

  it('returns null for an empty path', () => {
    expect(resolvePlacement(tree(), [])).toBeNull()
  })
})
