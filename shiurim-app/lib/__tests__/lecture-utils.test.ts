import { describe, it, expect } from 'vitest'
import { slugifyTitle, lectureSharePath, lectureIdFromParam } from '../lecture-utils'

describe('slugifyTitle', () => {
  it('lowercases and hyphenates', () => {
    expect(slugifyTitle('Genesis 25 (Set 1)')).toBe('genesis-25-set-1')
  })

  it('collapses runs of punctuation/whitespace to a single hyphen', () => {
    expect(slugifyTitle('  Foo --- Bar!!  Baz  ')).toBe('foo-bar-baz')
  })

  it('never produces a "--" that could be mistaken for the id separator', () => {
    expect(slugifyTitle('A -- B')).not.toContain('--')
  })

  it('returns an empty string for a title with no alphanumerics', () => {
    expect(slugifyTitle('!!! ??? ...')).toBe('')
  })

  it('caps length and trims a trailing hyphen left by the cap', () => {
    const slug = slugifyTitle('a'.repeat(90))
    expect(slug.length).toBeLessThanOrEqual(80)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('lectureSharePath', () => {
  it('builds {slug}--{id}', () => {
    expect(lectureSharePath('BN-9293', 'Genesis 25 (Set 1)'))
      .toBe('/lectures/genesis-25-set-1--BN-9293')
  })

  it('url-encodes ids with special characters', () => {
    expect(lectureSharePath('Aa Bb 5', 'Some Title')).toBe('/lectures/some-title--Aa%20Bb%205')
  })

  it('falls back to the bare-id form when the title has no slug', () => {
    expect(lectureSharePath('BN-1', '???')).toBe('/lectures/BN-1')
  })
})

describe('lectureIdFromParam', () => {
  it('returns a bare id unchanged', () => {
    expect(lectureIdFromParam('BN-9293')).toBe('BN-9293')
  })

  it('extracts the id after the last "--"', () => {
    expect(lectureIdFromParam('genesis-25-set-1--BN-9293')).toBe('BN-9293')
  })

  it('round-trips with lectureSharePath for an id containing a hyphen', () => {
    const id = 'BN-9293'
    const path = lectureSharePath(id, 'Genesis 25 (Set 1)')
    const param = decodeURIComponent(path.replace('/lectures/', ''))
    expect(lectureIdFromParam(param)).toBe(id)
  })
})
