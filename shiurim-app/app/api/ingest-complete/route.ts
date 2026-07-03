import { NextRequest, NextResponse } from 'next/server'
import { categorize } from '@/lib/ingest/categorizer'
import { writePendingLecture, writeFailedIngestion, writeCategoryFlag, triggerDeploy } from '@/lib/ingest/lectures-writer'
import { sendFlagNotification, sendFailureNotification } from '@/lib/ingest/notifier'

export const runtime = 'nodejs'

// Callback from the GitHub Actions "zoom-ingest" worker after it has downloaded the
// recording and uploaded it to R2. Runs Steps 4-7 of the ingest-shiur route (categorize,
// persist, flag, deploy) — everything after the download/upload that now happens remotely.
export async function POST(req: NextRequest) {
  // Authenticate the caller
  const secret = req.headers.get('x-ingest-secret')
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    lectureId, title, rabbi, description, date, senderEmail,
    publicUrl, duration, shareUrl, error,
  } = body as {
    lectureId?: string; title?: string; rabbi?: string; description?: string
    date?: string; senderEmail?: string; publicUrl?: string; duration?: number
    shareUrl?: string; error?: string
  }

  // Failure branch: the worker couldn't download/upload the recording.
  if (error) {
    await writeFailedIngestion({
      senderEmail: senderEmail ?? '',
      rawTitle: title ?? '',
      rawRabbi: rabbi ?? '',
      zoomShareUrl: shareUrl ?? '',
      failureReason: `browser_ingest_failed: ${error}`,
      rawEmailSnippet: '',
    })
    await sendFailureNotification({
      title: title ?? '',
      rabbi: rabbi ?? '',
      zoomShareUrl: shareUrl ?? '',
      reason: `browser_ingest_failed: ${error}`,
    })
    return NextResponse.json({ ok: true, recorded: 'failure' })
  }

  if (!lectureId || !title || !date || !publicUrl) {
    return NextResponse.json({ error: 'Missing required success fields' }, { status: 400 })
  }

  // Step 4: Categorize
  const catResult = await categorize(title, description ?? '')
  const shouldFlag = catResult.tier === 2 && catResult.confidence === 'low'

  // Steps 5-7: Persist to DB, flag, and deploy.
  try {
    // Step 5: Write to Supabase
    await writePendingLecture({
      id: lectureId,
      title,
      speaker: rabbi || 'Unknown',
      date,
      description: description ?? '',
      audio_url: publicUrl,
      duration: duration ?? 0,
      tags: [],
      node_path: catResult.nodePath,
    })

    // Step 6: Write flag if low confidence
    if (shouldFlag) {
      const alternatives = 'alternatives' in catResult ? catResult.alternatives : []
      await writeCategoryFlag({
        shiurId: lectureId,
        proposedPath: catResult.nodePath,
        alternatives,
        tier: catResult.tier,
        confidence: catResult.confidence,
      })
      await sendFlagNotification({
        shiurId: lectureId,
        title,
        rabbi: rabbi ?? '',
        proposedPath: catResult.nodePath,
        alternatives,
        confidence: catResult.confidence,
        tier: catResult.tier,
      })
    }

    // Step 7: Trigger rebuild
    await triggerDeploy()
  } catch (e) {
    await writeFailedIngestion({
      senderEmail: senderEmail ?? '',
      rawTitle: title,
      rawRabbi: rabbi ?? '',
      zoomShareUrl: shareUrl ?? '',
      failureReason: `Write failed: ${String(e)}`,
      rawEmailSnippet: '',
    })
    return NextResponse.json({ error: 'Failed to persist shiur' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    lectureId,
    nodePath: catResult.nodePath,
    flagged: shouldFlag,
    dryRun: process.env.INGEST_DRY_RUN === 'true',
  })
}
