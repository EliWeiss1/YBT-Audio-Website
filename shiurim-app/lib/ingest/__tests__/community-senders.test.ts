import { describe, it, expect } from 'vitest'
import { generateLectureId, applyTitleSuffix, communitySender } from '../types'

describe('community senders (Masoret)', () => {
  it('gives masoretclasses@gmail.com shiurim a MASORET- id', () => {
    expect(generateLectureId('masoretclasses@gmail.com')).toMatch(/^MASORET-\d{8}-[0-9a-f]{6}$/)
    expect(generateLectureId('MasoretClasses@Gmail.com')).toMatch(/^MASORET-/)
  })

  it('keeps INGEST- ids (in yeshiva) for everyone else', () => {
    expect(generateLectureId('pchait@ybt.org')).toMatch(/^INGEST-\d{8}-[0-9a-f]{6}$/)
    expect(generateLectureId()).toMatch(/^INGEST-/)
    expect(communitySender('pchait@ybt.org')).toBeNull()
  })

  it('labels Masoret titles once, and leaves other senders alone', () => {
    expect(applyTitleSuffix('Pirkei Avos Perek 3', 'masoretclasses@gmail.com')).toBe('Pirkei Avos Perek 3 (Masoret)')
    expect(applyTitleSuffix('Pirkei Avos (Masoret)', 'masoretclasses@gmail.com')).toBe('Pirkei Avos (Masoret)')
    expect(applyTitleSuffix('Pirkei Avos', 'pchait@ybt.org')).toBe('Pirkei Avos')
  })
})
