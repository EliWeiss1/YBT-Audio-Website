import { NextRequest, NextResponse } from 'next/server'
import { parseIngestEmail } from '@/lib/ingest/email-parser'
import { resolveZoomShareUrl } from '@/lib/ingest/zoom-resolver'
import { uploadAudioToR2 } from '@/lib/ingest/r2-uploader'
import { categorize } from '@/lib/ingest/categorizer'
import { writePendingLecture, writeFailedIngestion, writeCategoryFlag, triggerDeploy } from '@/lib/ingest/lectures-writer'
import { sendFlagNotification, sendFailureNotification } from '@/lib/ingest/notifier'
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

  const { title, rabbi, description, zoomShareUrl, date, senderEmail } = parsed

  // Step 2: Resolve Zoom share URL
  const zoomResult = await resolveZoomShareUrl(zoomShareUrl)
  if (!zoomResult.ok) {
    await writeFailedIngestion({
      senderEmail, rawTitle: title, rawRabbi: rabbi,
      zoomShareUrl, failureReason: zoomResult.reason,
      rawEmailSnippet: rawEmail.toString('utf8').slice(0, 500),
    })
    await sendFailureNotification({ title, rabbi, zoomShareUrl, reason: zoomResult.reason })
    return NextResponse.json({ error: `Zoom resolution failed: ${zoomResult.reason}` }, { status: 422 })
  }

  // Step 3: Upload to R2
  const lectureId = generateLectureId()
  const r2Key = `ingest/${date}/${lectureId}.mp3`
  const uploadResult = await uploadAudioToR2(zoomResult.downloadUrl, r2Key)
  if ('reason' in uploadResult) {
    await writeFailedIngestion({
      senderEmail, rawTitle: title, rawRabbi: rabbi,
      zoomShareUrl, failureReason: uploadResult.reason,
      rawEmailSnippet: rawEmail.toString('utf8').slice(0, 500),
    })
    await sendFailureNotification({ title, rabbi, zoomShareUrl, reason: uploadResult.reason })
    return NextResponse.json({ error: `Upload failed: ${uploadResult.reason}` }, { status: 500 })
  }

  // Step 4: Categorize
  const catResult = await categorize(title, description)
  const shouldFlag = catResult.tier === 2 && catResult.confidence === 'low'

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

  return NextResponse.json({
    ok: true,
    lectureId,
    nodePath: catResult.nodePath,
    flagged: shouldFlag,
    dryRun: process.env.INGEST_DRY_RUN === 'true',
  })
}
