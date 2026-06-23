import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)
const adminEmail = process.env.ADMIN_EMAIL ?? 'eliisaweiss@gmail.com'

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

  await resend.emails.send({
    from: 'onboarding@resend.dev',
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
}

export async function sendFailureNotification(opts: {
  title: string
  rabbi: string
  zoomShareUrl: string
  reason: string
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would send failure notification for:', opts.title)
    return
  }
  await resend.emails.send({
    from: 'ingest@noreply.ybt.org',
    to: adminEmail,
    subject: `[Shiur Ingest] FAILED: ${opts.title}`,
    html: `
      <h2>Shiur ingestion failed</h2>
      <p><strong>Title:</strong> ${opts.title}</p>
      <p><strong>Rabbi:</strong> ${opts.rabbi}</p>
      <p><strong>Zoom URL:</strong> <a href="${opts.zoomShareUrl}">${opts.zoomShareUrl}</a></p>
      <p><strong>Reason:</strong> ${opts.reason}</p>
      <p>You may need to add this shiur manually.</p>
    `,
  })
}
