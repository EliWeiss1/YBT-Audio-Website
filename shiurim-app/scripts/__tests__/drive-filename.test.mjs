import { describe, it, expect } from 'vitest'
import {
  parseDriveFilename, parseMasoretFilename, normalizeSpeaker, speakerSlug,
  resolveSpeaker, folderSpeaker, titleLooksMisordered, dedupePreferAudio,
} from '../lib/drive-filename.mjs'

describe('parseDriveFilename', () => {
  it('parses the canonical date_rabbi_title form', () => {
    expect(parseDriveFilename('2026-02-25_RabbiBald_Megillah-Pirsumei-Nisah.m4a')).toEqual({
      ok: true,
      date: '2026-02-25',
      rabbiToken: 'RabbiBald',
      title: 'Megillah Pirsumei Nisah',
    })
  })

  it('joins extra underscore segments into the title (title can contain _)', () => {
    expect(parseDriveFilename('2026-03-04_RabbiBald_Minhag05_Afikoman01.m4a')).toMatchObject({
      ok: true,
      date: '2026-03-04',
      rabbiToken: 'RabbiBald',
      title: 'Minhag05 Afikoman01',
    })
  })

  it('handles a hyphenated rabbi token', () => {
    expect(parseDriveFilename('2026-05-17_Rabbi-Zimmer_The-Aron-Decimated-The-Levi.m4a')).toMatchObject({
      ok: true,
      rabbiToken: 'Rabbi-Zimmer',
      title: 'The Aron Decimated The Levi',
    })
  })

  it('handles a multi-part hyphenated rabbi token', () => {
    expect(parseDriveFilename('2026-05-03_Rabbi-Elie-Feder_Omer-Shtei-Halechem-and-More.m4a')).toMatchObject({
      ok: true,
      rabbiToken: 'Rabbi-Elie-Feder',
      title: 'Omer Shtei Halechem and More',
    })
  })

  it('normalizes a compact YYYYMMDD date', () => {
    expect(parseDriveFilename('20260129_RabbiBald_Minhag01.m4a')).toMatchObject({
      ok: true,
      date: '2026-01-29',
      title: 'Minhag01',
    })
  })

  it('accepts .mp4 and .mp3 extensions too', () => {
    expect(parseDriveFilename('2026-01-01_Rabbi-Test_Foo.mp4').ok).toBe(true)
    expect(parseDriveFilename('2026-01-01_Rabbi-Test_Foo.mp3').ok).toBe(true)
  })

  it('is case-insensitive about the extension', () => {
    expect(parseDriveFilename('2026-01-01_Rabbi-Test_Foo.M4A').ok).toBe(true)
  })

  it('rejects a name with no underscores', () => {
    expect(parseDriveFilename('no-underscores-here.m4a').ok).toBe(false)
  })

  it('rejects a name missing a title segment', () => {
    expect(parseDriveFilename('2026-02-25_RabbiBald.m4a').ok).toBe(false)
  })

  it('rejects a non-date first segment', () => {
    expect(parseDriveFilename('SomeText_Rabbi-X_Title.m4a').ok).toBe(false)
  })

  it('rejects an impossible calendar date', () => {
    expect(parseDriveFilename('2026-13-40_Rabbi-X_Title.m4a').ok).toBe(false)
  })

  it('rejects an empty title after cleanup', () => {
    expect(parseDriveFilename('2026-02-25_RabbiBald_---.m4a').ok).toBe(false)
  })
})

describe('parseMasoretFilename', () => {
  it('parses "Rabbi - Title - Masoret <date>"', () => {
    expect(parseMasoretFilename('Rabbi Weiss - Haggadah - Dayeinu - Masoret 3-22-26.m4a')).toEqual({
      ok: true,
      date: '2026-03-22',
      rabbiToken: 'Rabbi Weiss',
      title: 'Haggadah - Dayeinu',
    })
  })

  it('parses "Rabbi - Title - Masoret - <date>" (extra hyphen before the date)', () => {
    expect(parseMasoretFilename(
      "Rabbi Weiss - Parshat Behar - Chapter 25 Verse 25 - Don't sell all of your inheritence 2025-2026 - Masoret - 5-10-26.m4a",
    )).toMatchObject({
      ok: true,
      date: '2026-05-10',
      rabbiToken: 'Rabbi Weiss',
      title: "Parshat Behar - Chapter 25 Verse 25 - Don't sell all of your inheritence 2025-2026",
    })
  })

  it('tolerates double spaces and a trailing space before the extension', () => {
    expect(parseMasoretFilename(
      'Rabbi Weiss - Parshat Emor - The Blasphemer and The Showbread  - Masoret - 5-3-26 .m4a',
    )).toMatchObject({
      ok: true,
      date: '2026-05-03',
      title: 'Parshat Emor - The Blasphemer and The Showbread',
    })
  })

  it('drops a trailing "Edit" marker after the date', () => {
    expect(parseMasoretFilename('Rabbi Weiss - Parshat Mishpatim - The widow and the orphan - Masoret 2-15-26 Edit.mp3'))
      .toMatchObject({ ok: true, date: '2026-02-15', title: 'Parshat Mishpatim - The widow and the orphan' })
  })

  it('returns a null date when the title has no date after the Masoret marker', () => {
    expect(parseMasoretFilename(
      'Rabbi Weiss - Parshat Shelach - Chapter 14 Verse 17 Slow to Anger - 2025-2026 - Masoret.m4a',
    )).toMatchObject({
      ok: true,
      date: null,
      title: 'Parshat Shelach - Chapter 14 Verse 17 Slow to Anger - 2025-2026',
    })
  })

  it('rejects a filename with no "- Masoret" marker', () => {
    expect(parseMasoretFilename('Rabbi Weiss - Some Title.m4a').ok).toBe(false)
  })

  it('rejects an impossible calendar date after the marker', () => {
    expect(parseMasoretFilename('Rabbi Weiss - Some Title - Masoret 13-40-26.m4a').ok).toBe(false)
  })
})

describe('normalizeSpeaker', () => {
  it('splits camelCase rabbi tokens', () => {
    expect(normalizeSpeaker('RabbiBald')).toBe('Rabbi Bald')
  })

  it('turns hyphens into spaces', () => {
    expect(normalizeSpeaker('Rabbi-Zimmer')).toBe('Rabbi Zimmer')
    expect(normalizeSpeaker('Rabbi-Elie-Feder')).toBe('Rabbi Elie Feder')
  })

  it('applies an override map keyed by the raw token', () => {
    expect(normalizeSpeaker('RabbiBald', { RabbiBald: 'Rabbi Yehuda Bald' })).toBe('Rabbi Yehuda Bald')
  })

  it('applies an override map keyed by the normalized name (case-insensitive)', () => {
    expect(normalizeSpeaker('Rabbi-Zimmer', { 'rabbi zimmer': 'Rabbi Dovid Zimmer' })).toBe('Rabbi Dovid Zimmer')
  })
})

describe('speakerSlug', () => {
  it('lowercases and dash-joins', () => {
    expect(speakerSlug('Rabbi Bald')).toBe('rabbi-bald')
    expect(speakerSlug('Rabbi Elie Feder')).toBe('rabbi-elie-feder')
  })

  it('strips punctuation', () => {
    expect(speakerSlug('Mrs. F. Chait')).toBe('mrs-f-chait')
  })
})

describe('folderSpeaker', () => {
  it('strips a " - Topic" suffix from a root folder name', () => {
    expect(folderSpeaker('Rabbi Bald - Gemara')).toBe('Rabbi Bald')
    expect(folderSpeaker('Rabbi Zemel - Perek Chelek')).toBe('Rabbi Zemel')
  })
  it('passes a plain per-rabbi subfolder through', () => {
    expect(folderSpeaker('Rabbi Zimmer')).toBe('Rabbi Zimmer')
    expect(folderSpeaker('Shaye Mann')).toBe('Shaye Mann')
  })
})

describe('resolveSpeaker', () => {
  it('agrees with the token when folder and token match', () => {
    expect(resolveSpeaker('RabbiBald', 'Rabbi Bald - Gemara')).toBe('Rabbi Bald')
    expect(resolveSpeaker('RabbiAriGinsberg', 'Rabbi Ari Ginsberg')).toBe('Rabbi Ari Ginsberg')
  })
  it('prefers the token when it is a more specific version of the folder', () => {
    // folder "Rabbi Feder" ⊂ token "Rabbi Elie Feder"
    expect(resolveSpeaker('Rabbi-Elie-Feder', 'Rabbi Feder')).toBe('Rabbi Elie Feder')
  })
  it('trusts the folder when the token disagrees (misordered filename)', () => {
    // 2026-01-19_The-Walk-Discussion_Shaye-Mann.m4a in folder "Shaye Mann"
    expect(resolveSpeaker('The-Walk-Discussion', 'Shaye Mann')).toBe('Shaye Mann')
  })
  it('lets an override map win', () => {
    expect(resolveSpeaker('Rabbi-Zimmer', 'Rabbi Zimmer', { 'Rabbi Zimmer': 'Rabbi Dovid Zimmer' }))
      .toBe('Rabbi Dovid Zimmer')
  })
})

describe('titleLooksMisordered', () => {
  it('flags a title that is just the speaker name', () => {
    expect(titleLooksMisordered('Shaye Mann', 'Shaye Mann')).toBe(true)
  })
  it('passes a normal title', () => {
    expect(titleLooksMisordered('Yam Suf', 'Rabbi Zimmer')).toBe(false)
  })
})

describe('dedupePreferAudio', () => {
  it('drops a video when an audio sibling exists for the same folder+date', () => {
    const files = [
      { name: '2026-05-10_RabbiZiring_Imagery-in-Nevuah.m4a', folder: 'Rabbi Ziring' },
      { name: '2026-05-10_RabbiZiring_Imagery-in-Nevuah_Video.mp4', folder: 'Rabbi Ziring' },
    ]
    const { kept, dropped } = dedupePreferAudio(files)
    expect(kept.map(f => f.name)).toEqual(['2026-05-10_RabbiZiring_Imagery-in-Nevuah.m4a'])
    expect(dropped.map(f => f.name)).toEqual(['2026-05-10_RabbiZiring_Imagery-in-Nevuah_Video.mp4'])
  })
  it('keeps a video-only shiur (no audio sibling)', () => {
    const files = [{ name: '2026-01-19_The-Walk-Discussion_Shaye-Mann.mp4', folder: 'Shaye Mann' }]
    expect(dedupePreferAudio(files).kept).toHaveLength(1)
  })
  it('keeps two same-date audio parts (both audio, no video)', () => {
    const files = [
      { name: '2026-03-22_RabbiAriGinsberg_Part1.m4a', folder: 'Rabbi Ari Ginsberg' },
      { name: '2026-03-22_RabbiAriGinsberg_Part2.m4a', folder: 'Rabbi Ari Ginsberg' },
    ]
    expect(dedupePreferAudio(files).kept).toHaveLength(2)
  })
})
