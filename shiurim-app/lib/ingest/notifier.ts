import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const adminEmail = process.env.ADMIN_EMAIL ?? 'eliisaweiss@gmail.com'

// Resend's default sender. It only delivers to the Resend account owner's own
// address (adminEmail), so admin notifications work — but sends to anyone else
// (the rebbe-facing guidance emails) are rejected by Resend and land in the
// try/catch below. To make those deliver, verify a YBT domain in Resend and put
// it here. The owner rejected using the already-verified schedusolver.com for
// rabbi-facing mail (wrong brand), and ybt.org can't be verified on this account.
const fromAddress = 'YBT Shiurim <onboarding@resend.dev>'

export async function sendFlagNotification(opts: {
  shiurId: string
  title: string
  rabbi: string
  proposedPath: string[]
  alternatives: string[][]
  confidence: 'high' | 'low'
  tier: number
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would send flag notification for:', opts.title)
    return
  }
  const adminUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/admin/flags`
    : '/admin/flags'

  try {
    await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `[Shiur Ingest] Low-confidence categorization: ${opts.title}`,
      html: `
        <h2>Shiur needs categorization review</h2>
        <p><strong>Title:</strong> ${opts.title}</p>
        <p><strong>Rabbi:</strong> ${opts.rabbi}</p>
        <p><strong>Proposed path:</strong> ${opts.proposedPath.join(' → ')}</p>
        <p><strong>Confidence:</strong> ${opts.confidence} (Tier ${opts.tier})</p>
        ${opts.alternatives.length ? `<p><strong>Alternatives:</strong><br>${opts.alternatives.map(a => a.join(' → ')).join('<br>')}</p>` : ''}
        <p><a href="${adminUrl}">Review in admin panel →</a></p>
      `,
    })
  } catch (e) {
    console.error('sendFlagNotification: failed to send admin email', e)
  }
}

export async function sendFailureNotification(opts: {
  title: string
  rabbi: string
  zoomShareUrl: string
  reason: string
  rawEmailSnippet?: string
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would send failure notification for:', opts.title)
    return
  }
  try {
    await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `[Shiur Ingest] FAILED: ${opts.title}`,
      html: `
        <h2>Shiur ingestion failed</h2>
        <p><strong>Title:</strong> ${opts.title}</p>
        <p><strong>Rabbi:</strong> ${opts.rabbi}</p>
        <p><strong>Zoom URL:</strong> <a href="${opts.zoomShareUrl}">${opts.zoomShareUrl}</a></p>
        <p><strong>Reason:</strong> ${opts.reason}</p>
        <p>You may need to add this shiur manually.</p>
        ${opts.rawEmailSnippet ? `<p><strong>Original email (excerpt):</strong></p><pre style="white-space:pre-wrap;background:#f5f5f5;padding:8px;">${opts.rawEmailSnippet}</pre>` : ''}
      `,
    })
  } catch (e) {
    console.error('sendFailureNotification: failed to send admin email', e)
  }
}

export async function sendParseFailureNotification(opts: {
  senderEmail: string
  subject: string
  reason: 'no_title' | 'no_recording_url' | 'no_separate_titles'
  rawEmailSnippet: string
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would send parse-failure notifications for:', opts.senderEmail, opts.reason)
    return
  }

  const guidance = opts.reason === 'no_title'
    ? `We couldn't find a title for the shiur. Please resend with the shiur's title as the very first line of your message (e.g. "Chullin 42a - Treifos"), optionally followed by the rabbi's name on the second line and a short description on the third.`
    : opts.reason === 'no_separate_titles'
    ? `You marked the recordings as "separate" but only gave one title. Please resend with the first shiur's title on line 1, and each additional shiur's title on its own line after the word "separate".`
    : `We couldn't find a Zoom recording link in your message. Please make sure the "zoom.us/rec/share/..." link is included.`

  // Let the sender know so they can just resend correctly, without needing an admin.
  // Isolated in its own try/catch so a failure can never block the admin
  // notification below.
  if (opts.senderEmail) {
    try {
      await resend.emails.send({
        from: fromAddress,
        to: opts.senderEmail,
        subject: `Couldn't process your shiur${opts.subject ? `: ${opts.subject}` : ''}`,
        html: `
          <p>Thanks for sending in a shiur! We ran into a problem processing it:</p>
          <p><strong>${guidance}</strong></p>
          <p>Just forward the recording again in the correct format and it'll go through automatically.</p>
        `,
      })
    } catch (e) {
      console.error('sendParseFailureNotification: failed to send sender email', e)
    }
  }

  // Keep the admin in the loop too, consistent with every other failure path.
  try {
    await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `[Shiur Ingest] Unparseable email from ${opts.senderEmail || 'unknown sender'}`,
      html: `
        <h2>Could not parse an incoming shiur email</h2>
        <p><strong>From:</strong> ${opts.senderEmail || '(unknown)'}</p>
        <p><strong>Subject:</strong> ${opts.subject || '(none)'}</p>
        <p><strong>Reason:</strong> ${opts.reason}</p>
        <p><strong>Original email (excerpt):</strong></p>
        <pre style="white-space:pre-wrap;background:#f5f5f5;padding:8px;">${opts.rawEmailSnippet}</pre>
      `,
    })
  } catch (e) {
    console.error('sendParseFailureNotification: failed to send admin email', e)
  }
}

export async function sendFallbackMatchNotification(opts: {
  title: string
  rabbi: string
  senderEmail: string
  zoomShareUrl: string
  lectureId: string
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would send fallback-match notification for:', opts.title)
    return
  }
  const adminUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/admin`
    : '/admin'
  try {
    await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `[Shiur Ingest] Verify audio: ${opts.title}`,
      html: `
        <h2>Recording matched by fallback, not exact URL</h2>
        <p>The forwarded Zoom link for <strong>${opts.title}</strong> (${opts.rabbi || opts.senderEmail})
        didn't exactly match any recording on ${opts.senderEmail}'s Zoom account, so the
        <strong>most recent cloud recording</strong> was used instead. If this rebbe recorded more than
        one shiur recently, this could be the wrong audio.</p>
        <p><strong>Lecture ID:</strong> ${opts.lectureId}</p>
        <p><strong>Forwarded Zoom URL:</strong> <a href="${opts.zoomShareUrl}">${opts.zoomShareUrl}</a></p>
        <p><a href="${adminUrl}">Review in admin panel →</a></p>
      `,
    })
  } catch (e) {
    console.error('sendFallbackMatchNotification: failed to send admin email', e)
  }
}

export async function sendAutoMergeNotification(opts: {
  title: string
  rabbi: string
  senderEmail: string
  zoomShareUrl: string
  lectureId: string
  recordingCount: number
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would send auto-merge notification for:', opts.title)
    return
  }
  const adminUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/admin`
    : '/admin'
  try {
    await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `[Shiur Ingest] Auto-merged ${opts.recordingCount} recordings: ${opts.title}`,
      html: `
        <h2>Multiple recordings were auto-merged into one shiur</h2>
        <p>The Zoom share for <strong>${opts.title}</strong> (${opts.rabbi || opts.senderEmail})
        held <strong>${opts.recordingCount} recordings</strong>, but the email didn't say whether to
        merge or separate them. They were <strong>joined into one shiur</strong> (assuming an accidental
        stop/restart). If these were meant to be separate shiurim, resend with a
        <code>separate</code> line and a title per recording.</p>
        <p><strong>Lecture ID:</strong> ${opts.lectureId}</p>
        <p><strong>Forwarded Zoom URL:</strong> <a href="${opts.zoomShareUrl}">${opts.zoomShareUrl}</a></p>
        <p><a href="${adminUrl}">Review in admin panel →</a></p>
      `,
    })
  } catch (e) {
    console.error('sendAutoMergeNotification: failed to send admin email', e)
  }
}

export async function sendOAuthMissingNotification({
  title, rabbi, senderEmail, zoomShareUrl,
}: { title: string; rabbi: string; senderEmail: string; zoomShareUrl: string }): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] OAuth missing notification for:', senderEmail)
    return
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  const authorizeUrl = `${appUrl}/api/zoom/authorize?email=${encodeURIComponent(senderEmail)}&secret=${process.env.INGEST_SECRET}`
  try {
    await resend.emails.send({
      from: fromAddress,
      to: adminEmail,
      subject: `Action needed: Connect Zoom for ${senderEmail}`,
      html: `
        <p>A shiur from <strong>${rabbi || senderEmail}</strong> titled "<strong>${title}</strong>"
        could not be ingested — no Zoom OAuth token is stored for <strong>${senderEmail}</strong>.</p>
        <p>To authorize this account, send the rebbe this link:</p>
        <p><a href="${authorizeUrl}">${authorizeUrl}</a></p>
        <p>Zoom share URL: <a href="${zoomShareUrl}">${zoomShareUrl}</a></p>
      `,
    })
  } catch (e) {
    console.error('sendOAuthMissingNotification: failed to send admin email', e)
  }
}
