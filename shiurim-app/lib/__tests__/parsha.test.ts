import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { getWeeklyParshiyot, formatParshaTitle, ALL_PARSHA_NODE_IDS } from '../parsha'

// Noon UTC keeps the New York calendar date equal to the UTC date.
const at = (iso: string) => new Date(`${iso}T16:00:00Z`)
const title = (iso: string) => formatParshaTitle(getWeeklyParshiyot(at(iso)))

describe('getWeeklyParshiyot', () => {
  it('rolls over on Sunday: Shabbos still shows its own parsha, Sunday shows the next', () => {
    expect(title('2026-10-10')).toBe('Bereishit') // Shabbos
    expect(title('2026-10-11')).toBe('Noach')     // Sunday
    expect(title('2026-10-14')).toBe('Noach')     // midweek
    expect(title('2026-10-17')).toBe('Noach')     // next Shabbos
    expect(title('2026-10-18')).toBe('Lech Lecha')
  })

  it('returns both parshiyot on a double week (diaspora)', () => {
    const refs = getWeeklyParshiyot(at('2026-03-09'))
    expect(refs.map(r => r.nodeId)).toEqual(['shemot-vayakhel', 'shemot-pekudei'])
    expect(formatParshaTitle(refs)).toBe('Vayakhel–Pekudei')
  })

  it('always resolves to one or two parshiyot, every day for six years', () => {
    const d = new Date(Date.UTC(2026, 0, 1, 16))
    for (let i = 0; i < 365 * 6; i++, d.setUTCDate(d.getUTCDate() + 1)) {
      const n = getWeeklyParshiyot(d).length
      expect(n, d.toISOString()).toBeGreaterThanOrEqual(1)
      expect(n, d.toISOString()).toBeLessThanOrEqual(2)
    }
  })
})

describe('parsha node ids', () => {
  it('all exist in the generated lectures tree', () => {
    const tree = JSON.parse(
      readFileSync(join(process.cwd(), 'public', 'lectures-data', 'tree.json'), 'utf8'),
    )
    const ids = new Set<string>()
    const walk = (n: any) => { ids.add(n.id); (n.children ?? []).forEach(walk) }
    ;(Array.isArray(tree) ? tree : tree.children ?? tree.categories).forEach(walk)
    for (const id of ALL_PARSHA_NODE_IDS) expect(ids.has(id), id).toBe(true)
  })
})
