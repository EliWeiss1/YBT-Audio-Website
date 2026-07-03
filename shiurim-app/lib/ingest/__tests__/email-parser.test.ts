import { describe, it, expect } from 'vitest'
import { parseIngestEmail } from '../email-parser'

// Minimal raw MIME fixture — real emails will be multipart/alternative; this
// covers the happy path. Edge-case fixtures added below.
const FIXTURE_FULL = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

Bava Kamma 34a — Damages for Fire
Rabbi Weiss
Covers the halacha of aish mamono

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

Shabbos 10b — Kavod Shabbat

---------- Forwarded message ---------
From: no-reply@zoom.us

Join URL: https://zoom.us/rec/share/XYZ789
`

const FIXTURE_KNOWN_SENDER_NO_RABBI_LINE = `From: efeder@ybt.org
To: shiurim@ybt.org
Date: Thu, 16 Jan 2025 08:00:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

Shabbos 10b — Kavod Shabbat

---------- Forwarded message ---------
From: no-reply@zoom.us

Join URL: https://zoom.us/rec/share/XYZ789
`

const FIXTURE_NO_PREAMBLE = `From: unknown@gmail.com
To: shiurim@ybt.org
Date: Fri, 17 Jan 2025 09:00:00 +0000
Subject: Meeting assets are ready
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

Multi-link test
Rabbi Test

---------- Forwarded message ---------
Join URL: https://zoom.us/rec/share/FIRST
Additional: https://zoom.us/rec/share/SECOND
`

const FIXTURE_LABELED = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

Title: Bava Kamma 34a — Damages for Fire
Rabbi: Rabbi Weiss
Description: Covers the halacha of aish mamono

---------- Forwarded message ---------
From: no-reply@zoom.us

Join URL: https://zoom.us/rec/share/ABCDEF123456
`

// Real Apple Mail double-forward: Feder → Akiva/Hillel → shiurim@, each hop
// nesting "Begin forwarded message:" (no dashes) one level deeper than the last.
const FIXTURE_APPLE_MAIL_NESTED = `From: hillel@example.com
To: shiurim@ybt.org
Date: Wed, 3 Jun 2026 09:00:00 +0000
Subject: Fwd: Fwd: Meeting assets for Rabbi Feder's Shiur are ready!
Content-Type: text/plain; charset=utf-8

Shiur title here

Begin forwarded message:

From: Rabbi Elie Feder <efeder@ybt.org>
Date: May 31, 2026 at 12:27:52 PM EDT
To: Akiva Kreiger <akiva.krieger@gmail.com>, Hillel Wolf <wolfy12@gmail.com>
Subject: Fwd: Meeting assets for Rabbi Feder's Shiur are ready!

The philosophy of achilas kodshim
Hillel Wolf

Begin forwarded message:

From: Zoom <no-reply@zoom.us>
Date: May 31, 2026 at 11:49:52 AM EDT
To: efeder@ybt.org
Subject: Meeting assets for Rabbi Feder's Shiur are ready!

Meeting assets for Rabbi Feder's Shiur are ready!

Recording
Duration: 01:04:41
Shareable link: https://us06web.zoom.us/rec/share/k1kAMSoaYz69KK_qfmh0kuWXBDp9ltWJxpdWoCpwYcG5AnCRd52pT0h5FUBytrj0.MRJwbVGc0tcOx-Ak
View in Zoom

Thank you for choosing Zoom,
The Zoom Team
`

describe('parseIngestEmail', () => {
  it('extracts the title from an Apple Mail double-forward and dates it from the nested Zoom header, not the outer send date', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_APPLE_MAIL_NESTED))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title).toBe('Shiur title here')
      expect(result.data.date).toBe('2026-05-31')
      expect(result.data.senderEmail).toBe('hillel@example.com')
    }
  })


  it('extracts all fields positionally: title/rabbi/description on lines 1-3', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_FULL))
    expect(result).toEqual({
      ok: true,
      data: {
        title: 'Bava Kamma 34a — Damages for Fire',
        rabbi: 'Rabbi Weiss',
        description: 'Covers the halacha of aish mamono',
        recordingUrl: 'https://zoom.us/rec/share/ABCDEF123456',
        date: '2025-01-15',
        senderEmail: 'rabbi@example.com',
      },
    })
  })

  it('leaves rabbi empty when line 2 is absent and sender is unknown', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_NO_RABBI))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.rabbi).toBe('')
      expect(result.data.title).toBe('Shabbos 10b — Kavod Shabbat')
      expect(result.data.senderEmail).toBe('known@yeshiva.edu')
    }
  })

  it('falls back to the sender-rabbi map when line 2 is absent and sender is known', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_KNOWN_SENDER_NO_RABBI_LINE))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.rabbi).toBe('Rabbi Feder')
  })

  it('still accepts legacy Title:/Rabbi:/Description: labels', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_LABELED))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data.title).toBe('Bava Kamma 34a — Damages for Fire')
      expect(result.data.rabbi).toBe('Rabbi Weiss')
      expect(result.data.description).toBe('Covers the halacha of aish mamono')
    }
  })

  it('returns a no_title failure when the preamble is empty, ignoring the Zoom-generated Subject', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_NO_PREAMBLE))
    expect(result).toEqual({ ok: false, reason: 'no_title', senderEmail: 'unknown@gmail.com', subject: 'Meeting assets are ready' })
  })

  it('returns a no_recording_url failure when no link is found', async () => {
    const fixture = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Fwd: Recording Ready
Content-Type: text/plain; charset=utf-8

Berachos 5a
Rabbi Cohen
`
    const result = await parseIngestEmail(Buffer.from(fixture))
    expect(result).toEqual({ ok: false, reason: 'no_recording_url', senderEmail: 'rabbi@example.com', subject: 'Fwd: Recording Ready' })
  })

  it('uses only the first zoom share URL when multiple are present', async () => {
    const result = await parseIngestEmail(Buffer.from(FIXTURE_MULTI_ZOOM))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.recordingUrl).toBe('https://zoom.us/rec/share/FIRST')
  })

  it('extracts a Dropbox link as the recording URL', async () => {
    const fixture = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Shiur recording
Content-Type: text/plain; charset=utf-8

Berachos 5a
Rabbi Cohen
On suffering

Recording: https://www.dropbox.com/s/abc123/shiur.mp3?dl=0
`
    const result = await parseIngestEmail(Buffer.from(fixture))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.recordingUrl).toBe('https://www.dropbox.com/s/abc123/shiur.mp3?dl=0')
  })

  it('extracts a direct mp3 URL as the recording URL', async () => {
    const fixture = `From: rabbi@example.com
To: shiurim@ybt.org
Date: Wed, 15 Jan 2025 10:30:00 +0000
Subject: Shiur recording
Content-Type: text/plain; charset=utf-8

Berachos 5a
Rabbi Cohen

https://cdn.example.com/recordings/berachos-5a.mp3
`
    const result = await parseIngestEmail(Buffer.from(fixture))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.data.recordingUrl).toBe('https://cdn.example.com/recordings/berachos-5a.mp3')
  })
})
