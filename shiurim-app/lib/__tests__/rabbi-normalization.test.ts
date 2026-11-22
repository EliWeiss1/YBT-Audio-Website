import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import { createRequire } from 'module'
import { normalizeRabbi, getRawVariants } from '../rabbi-normalization'

const require = createRequire(import.meta.url)
const scriptLib = require('../../scripts/lib/rabbi-normalization.cjs') as { normalizeRabbi: (s: string) => string }

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
    expect(normalizeRabbi('Rabbi Ben Aaronson')).toBe('Rabbi Ben Aaronson')
    expect(normalizeRabbi('Rabbi David Zimmerman')).toBe('Rabbi David Zimmerman')
  })

  it('exposes raw variants for the rabbi page', () => {
    expect(getRawVariants('Rabbi Aaron Zimmer')).toContain('Rabbi Aron Zimmer')
  })
})

describe('normalizeRabbi — merged speaker variants', () => {
  it.each([
    // Chait family: bare "Rabbi Chait" is Rabbi Yisroel Chait
    ['Rabbi Yisroel Chait', 'Rabbi Chait'],
    ['Rabbi Y. Chait', 'Rabbi Chait'],
    ['R. Chait', 'Rabbi Chait'],
    ['Rabbi Chait', 'Rabbi Chait'],
    ['R. Pesach Chait', 'Rabbi Pesach Chait'],
    ['Rabbi P. Chait', 'Rabbi Pesach Chait'],
    ['Rav Pesach Chait', 'Rabbi Pesach Chait'],
    ['R. C.O. Chait', 'Rabbi Chaim Ozer Chait'],
    ['R. Chamim Ozer Chait', 'Rabbi Chaim Ozer Chait'],
    ['Rabbi Chaim Ozer Chait', 'Rabbi Chaim Ozer Chait'],
    ['Rabbi CO Chait', 'Rabbi Chaim Ozer Chait'],
    ['Mrs. F. Chait', 'Mrs. Freyda Chait'],
    ['Freyda Chait', 'Mrs. Freyda Chait'],
    ['Rebbetzin Freida Chait', 'Mrs. Freyda Chait'],
    // Others
    ['Rabbi Reuven Mann', 'Rabbi Mann'],
    ['R. Mann', 'Rabbi Mann'],
    ['Rabbi Henoch Bald', 'Rabbi Bald'],
    ['Rabbi Zev Cinamon', 'Rabbi Cinamon'],
    ['Rabbi Morton Moskowitz', 'Rabbi Moskowitz'],
    ['Rabbi D. Markowitz', 'Rabbi David Markowitz'],
    ['Rabbi Feder', 'Rabbi E. Feder'],
    ['Rabbi Elie Feder', 'Rabbi E. Feder'],
    ['Rabbi E Feder', 'Rabbi E. Feder'],
    ['Rabbi Zucker', 'Rabbi Saul Zucker'],
    ['S. Zucker', 'Rabbi Saul Zucker'],
    ['Rabbi Moshe Fistel', 'Rabbi Fistel'],
    ['Rabbi Fistel', 'Rabbi Fistel'],
    ['Rabbi Eliezer Barany', 'Rabbi Barany'],
    ['Rabbi Barany (Masoret)', 'Rabbi Barany'],
    ['Rabbi Ruben Gober', 'Rabbi Gober'],
    ['Rabbi Yaakov Trachtman', 'Rabbi Trachtman'],
    ['R. M. Gisser', 'Rabbi Gisser'],
    ['Rabbi Marshall Gisser', 'Rabbi Gisser'],
  ])('maps "%s" to "%s"', (raw, canonical) => {
    expect(normalizeRabbi(raw)).toBe(canonical)
  })

  it.each([
    'Rabbi Moshe Zucker', 'Rabbi David Feder', 'Rabbi Mendy Feder', 'Hindy Feder', 'Aliza Feder',
    'R. J. Weiss', 'Rabbi Weiss', 'Rabbi Dr. Hillel Wolf', 'Tzvi Wolf', 'Rabbi Matt Schneeweiss', '',
  ])('leaves distinct speaker "%s" untouched', (raw) => {
    expect(normalizeRabbi(raw)).toBe(raw)
  })

  it('scripts/lib twin agrees with the TS version', () => {
    for (const raw of ['Rabbi Yisroel Chait', 'R. C.O. Chait', 'Rabbi Feder', 'Rabbi Barany (Masoret)', 'Rabbi Moshe Zucker', 'Rav Zimmer']) {
      expect(scriptLib.normalizeRabbi(raw)).toBe(normalizeRabbi(raw))
    }
  })
})

describe('data/lectures.json', () => {
  it('stores only canonical speaker names (run `npm run normalize-speakers` if this fails)', () => {
    const data = JSON.parse(readFileSync(join(__dirname, '../../data/lectures.json'), 'utf8'))
    const bad = new Set<string>()
    const walk = (n: { lectures?: { speaker?: string }[]; children?: unknown[] }) => {
      for (const l of n.lectures ?? []) if (typeof l.speaker === 'string' && normalizeRabbi(l.speaker) !== l.speaker) bad.add(l.speaker)
      for (const c of n.children ?? []) walk(c as typeof n)
    }
    data.categories.forEach(walk)
    expect([...bad]).toEqual([])
  })
})
