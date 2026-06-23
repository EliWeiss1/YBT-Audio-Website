import { describe, it, expect } from 'vitest'
import { parseIngestEmail } from '../email-parser'

// Minimal raw MIME fixture — real emails will be multipart/alternative; this
// covers the happy path. Edge-case fixtures added below.
const FIXTURE_FULL = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

Title: Bava Kamma 34a — Damages for Fire
Rabbi: Rabbi Weiss
Description: Covers the halacha of aish mamono

---------- Forwarded message ---------
From: no-reply@zoom.us

Your recording is ready.
Join URL: https://zoom.us/rec/share/ABCDEF123456
`

const FIXTURE_NO_RABBI = `From: known@yeshiva.edu
To: shiurim@ybt.org
Date: Thu, 16 Jan 2025 08:00:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

Title: Shabbos 10b — Kavod Shabbat

---------- Forwarded message ---------
From: no-reply@zoom.us

Join URL: https://zoom.us/rec/share/XYZ789
`

const FIXTURE_NO_TITLE_OR_RABBI = `From: unknown@gmail.com
To: shiurim@ybt.org
Date: Fri, 17 Jan 2025 09:00:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

---------- Forwarded message ---------
From: no-reply@zoom.us

Join URL: https://zoom.us/rec/share/NOID
`

const FIXTURE_MULTI_ZOOM = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Sat, 18 Jan 2025 09:00:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

Title: Multi-link test
Rabbi: Rabbi Test

---------- Forwarded message ---------
Join URL: https://zoom.us/rec/share/FIRST
Additional: https://zoom.us/rec/share/SECOND
`

describe('parseIngestEmail', () => {
  it('extracts all fields from a complete forwarded email', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_FULL))
    expect(result).toEqual({
      title: 'Bava Kamma 34a — Damages for Fire',
      rabbi: 'Rabbi Weiss',
      description: 'Covers the halacha of aish mamono',
      recordingUrl: 'https://zoom.us/rec/share/ABCDEF123456',
      date: '2025-01-15',
      senderEmail: 'rabbi@example.com',
    })
  })

  it('leaves rabbi empty when line is absent (caller resolves from sender map)', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_NO_RABBI))
    expect(result.rabbi).toBe('')
    expect(result.title).toBe('Shabbos 10b — Kavod Shabbat')
    expect(result.senderEmail).toBe('known@yeshiva.edu')
  })

  it('returns null when title and zoom URL are both missing', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_NO_TITLE_OR_RABBI))
    expect(result).toBeNull()
  })

  it('uses only the first zoom share URL when multiple are present', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_MULTI_ZOOM))
    expect(result?.recordingUrl).toBe('https://zoom.us/rec/share/FIRST')
  })

  it('extracts a Dropbox link as the recording URL', async () => {
    const fixture = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Shiur recording
Content-Type: text/plain; charset=utf-8

Title: Berachos 5a
Rabbi: Rabbi Cohen
Description: On suffering

Recording: https://www.dropbox.com/s/abc123/shiur.mp3?dl=0
`
    const result = await parseIngestEmail(Buffer.from(fixture))
    expect(result?.recordingUrl).toBe('https://www.dropbox.com/s/abc123/shiur.mp3?dl=0')
  })

  it('extracts a direct mp3 URL as the recording URL', async () => {
    const fixture = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Shiur recording
Content-Type: text/plain; charset=utf-8

Title: Berachos 5a
Rabbi: Rabbi Cohen

https://cdn.example.com/recordings/berachos-5a.mp3
`
    const result = await parseIngestEmail(Buffer.from(fixture))
    expect(result?.recordingUrl).toBe('https://cdn.example.com/recordings/berachos-5a.mp3')
  })
})
