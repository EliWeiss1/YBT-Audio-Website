import { NextRequest, NextResponse } from 'next/server'
import { parseIngestEmail } from '@/lib/ingest/email-parser'
import { resolveRecordingUrl } from '@/lib/ingest/zoom-resolver'
import { uploadAudioToR2 } from '@/lib/ingest/r2-uploader'
import { categorize } from '@/lib/ingest/categorizer'
import { writePendingLecture, writeFailedIngestion, writeCategoryFlag, triggerDeploy } from '@/lib/ingest/lectures-writer'
import { sendFlagNotification, sendFailureNotification, sendOAuthMissingNotification, sendFallbackMatchNotification } from '@/lib/ingest/notifier'
import { dispatchBrowserIngest } from '@/lib/ingest/github-dispatch'
import { generateLectureId } from '@/lib/ingest/types'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  // Authenticate the caller
  const secret = req.headers.get('x-ingest-secret')
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rawEmail = Buffer.from(await req.arrayBuffer())

  // Step 1: Parse email
  const parsed = await parseIngestEmail(rawEmail)
  if (!parsed) {
    return NextResponse.json({ error: 'Could not parse email: missing title or Zoom URL' }, { status: 422 })
  }

  const { title, rabbi, description, recordingUrl, date, senderEmail } = parsed
  const lectureId = generateLectureId()

  // Zoom cloud recordings are passcode-protected and can only be downloaded by driving
  // the real player in a browser. Hand that off to the GitHub Actions worker (async) and
  // return 202 immediately; the worker calls back into /api/ingest-complete when done.
  if (/zoom\.us\/rec\/share\//i.test(recordingUrl)) {
    try {
      await dispatchBrowserIngest({ lectureId, shareUrl: recordingUrl, title, rabbi, description, date, senderEmail })
    } catch (e) {
      await writeFailedIngestion({
        senderEmail, rawTitle: title, rawRabbi: rabbi,
        zoomShareUrl: recordingUrl, failureReason: `dispatch_failed: ${String(e)}`,
        rawEmailSnippet: rawEmail.toString('utf8').slice(0, 500),
      })
      await sendFailureNotification({ title, rabbi, zoomShareUrl: recordingUrl, reason: 'dispatch_failed' })
      return NextResponse.json({ error: 'Failed to dispatch browser ingest' }, { status: 502 })
    }
    return NextResponse.json({ ok: true, lectureId, async: true, resolvedBy: 'browser' }, { status: 202 })
  }

  // Step 2: Resolve recording URL to a direct download URL
  const zoomResult = await resolveRecordingUrl(recordingUrl, senderEmail)
  if (!zoomResult.ok) {
    if (zoomResult.reason === 'no_oauth_token') {
      await sendOAuthMissingNotification({ title, rabbi, senderEmail, zoomShareUrl: recordingUrl })
    } else {
      await sendFailureNotification({ title, rabbi, zoomShareUrl: recordingUrl, reason: zoomResult.reason })
    }
    await writeFailedIngestion({
      senderEmail, rawTitle: title, rawRabbi: rabbi,
      zoomShareUrl: recordingUrl, failureReason: zoomResult.reason,
      rawEmailSnippet: rawEmail.toString('utf8').slice(0, 500),
    })
    return NextResponse.json({ error: `Recording resolution failed: ${zoomResult.reason}` }, { status: 422 })
  }
  if (zoomResult.matchedBy === 'fallback') {
    await sendFallbackMatchNotification({ title, rabbi, senderEmail, zoomShareUrl: recordingUrl, lectureId })
  }

  // Step 3: Upload to R2
  const r2Key = `ingest/${date}/${lectureId}.mp3`
  const uploadResult = await uploadAudioToR2(zoomResult.downloadUrl, r2Key)
  if ('reason' in uploadResult) {
    await writeFailedIngestion({
      senderEmail, rawTitle: title, rawRabbi: rabbi,
      zoomShareUrl: recordingUrl, failureReason: uploadResult.reason,
      rawEmailSnippet: rawEmail.toString('utf8').slice(0, 500),
    })
    await sendFailureNotification({ title, rabbi, zoomShareUrl: recordingUrl, reason: uploadResult.reason })
    return NextResponse.json({ error: `Upload failed: ${uploadResult.reason}` }, { status: 500 })
  }

  // Step 4: Categorize
  const catResult = await categorize(title, description)
  const shouldFlag = catResult.tier === 2 && catResult.confidence === 'low'

  // Steps 5-7: Persist to DB, flag, and deploy — wrapped so an R2-orphan is
  // avoided: if any write fails we record a failed_ingestions row instead.
  try {
    // Step 5: Write to Supabase
    await writePendingLecture({
      id: lectureId,
      title,
      speaker: rabbi || 'Unknown',
      date,
      description,
      audio_url: uploadResult.publicUrl,
      duration: uploadResult.duration,
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
        rabbi,
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
      senderEmail, rawTitle: title, rawRabbi: rabbi,
      zoomShareUrl: recordingUrl, failureReason: `Write failed: ${String(e)}`,
      rawEmailSnippet: rawEmail.toString('utf8').slice(0, 500),
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
