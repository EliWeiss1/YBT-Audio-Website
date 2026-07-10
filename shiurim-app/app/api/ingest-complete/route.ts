import { NextRequest, NextResponse } from 'next/server'
import { categorize } from '@/lib/ingest/categorizer'
import { categorizeDrive } from '@/lib/ingest/drive-categorizer'
import { writePendingLecture, writeFailedIngestion, writeCategoryFlag, triggerDeploy } from '@/lib/ingest/lectures-writer'
import { sendFlagNotification, sendFailureNotification, sendAutoMergeNotification } from '@/lib/ingest/notifier'

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
    publicUrl, duration, shareUrl, rawEmailSnippet, error,
    deferDeploy, autoMerged, recordingCount, source, suppressNotify, category, aliases,
  } = body as {
    lectureId?: string; title?: string; rabbi?: string; description?: string
    date?: string; senderEmail?: string; publicUrl?: string; duration?: number
    shareUrl?: string; rawEmailSnippet?: string; error?: string
    // Multi-recording: `deferDeploy` skips the rebuild for all but the last of N
    // "separate" shiurim; `autoMerged`/`recordingCount` flag an unprompted merge.
    deferDeploy?: boolean; autoMerged?: boolean; recordingCount?: number
    // `source` tags where the shiur came from (e.g. 'drive'); `suppressNotify` skips the
    // per-item flag email — the Google Drive worker sends one run-summary instead of an
    // email per shiur (avoids ~150 emails during the initial backfill).
    // `category` is a Drive folder's category pin: when set, categorize within it (with a
    // per-rabbi fallback) instead of searching the whole tree by title (Zoom path).
    // `aliases` maps title keywords → a node id for that folder (e.g. yomtov → gemarah-beitza).
    source?: string; suppressNotify?: boolean; category?: string; aliases?: Record<string, string>
  }

  // Failure branch: the worker couldn't download/upload the recording.
  if (error) {
    await writeFailedIngestion({
      senderEmail: senderEmail ?? '',
      rawTitle: title ?? '',
      rawRabbi: rabbi ?? '',
      zoomShareUrl: shareUrl ?? '',
      failureReason: `browser_ingest_failed: ${error}`,
      rawEmailSnippet: rawEmailSnippet ?? '',
    })
    await sendFailureNotification({
      title: title ?? '',
      rabbi: rabbi ?? '',
      zoomShareUrl: shareUrl ?? '',
      reason: `browser_ingest_failed: ${error}`,
      rawEmailSnippet,
    })
    return NextResponse.json({ ok: true, recorded: 'failure' })
  }

  if (!lectureId || !title || !date || !publicUrl) {
    return NextResponse.json({ error: 'Missing required success fields' }, { status: 400 })
  }

  // Step 4: Categorize. Drive shiurim carry a `category` folder pin → categorize within it
  // (per-rabbi fallback handles the unsure ones, so no manual flag). Everything else uses
  // the whole-tree title categorizer and flags low-confidence results for /admin/flags.
  let nodePath: string[]
  let nodeLabel: string | undefined
  let shouldFlag = false
  let flagInfo: { tier: number; confidence: 'high' | 'low'; alternatives: string[][] } | null = null

  const driveResult = category ? await categorizeDrive(title, category, rabbi || 'Unknown', aliases ?? {}).catch(() => null) : null
  if (driveResult) {
    nodePath = driveResult.nodePath
    nodeLabel = driveResult.nodeLabel
  } else {
    // Zoom path (or a Drive pin that failed to resolve → fall back to whole-tree).
    const catResult = await categorize(title, description ?? '')
    nodePath = catResult.nodePath
    shouldFlag = catResult.tier === 2 && catResult.confidence === 'low'
    if (shouldFlag) {
      flagInfo = { tier: catResult.tier, confidence: catResult.confidence, alternatives: 'alternatives' in catResult ? catResult.alternatives : [] }
    }
  }

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
      node_path: nodePath,
      node_label: nodeLabel,
    })

    // Step 6: Write flag if low confidence (whole-tree path only)
    if (shouldFlag && flagInfo) {
      await writeCategoryFlag({
        shiurId: lectureId,
        proposedPath: nodePath,
        alternatives: flagInfo.alternatives,
        tier: flagInfo.tier,
        confidence: flagInfo.confidence,
      })
      if (!suppressNotify) {
        await sendFlagNotification({
          shiurId: lectureId,
          title,
          rabbi: rabbi ?? '',
          proposedPath: nodePath,
          alternatives: flagInfo.alternatives,
          confidence: flagInfo.confidence,
          tier: flagInfo.tier,
        })
      }
    }

    // Let the admin know when the worker merged multiple recordings without being
    // told to (no merge/separate directive in the email).
    if (autoMerged) {
      await sendAutoMergeNotification({
        title,
        rabbi: rabbi ?? '',
        senderEmail: senderEmail ?? '',
        zoomShareUrl: shareUrl ?? '',
        lectureId,
        recordingCount: recordingCount ?? 0,
      })
    }

    // Step 7: Trigger rebuild — skipped for all but the last of N "separate" shiurim
    // so a single multi-recording email produces one deploy, not N.
    if (!deferDeploy) await triggerDeploy()
  } catch (e) {
    await writeFailedIngestion({
      senderEmail: senderEmail ?? '',
      rawTitle: title,
      rawRabbi: rabbi ?? '',
      zoomShareUrl: shareUrl ?? '',
      failureReason: `Write failed: ${String(e)}`,
      rawEmailSnippet: rawEmailSnippet ?? '',
    })
    return NextResponse.json({ error: 'Failed to persist shiur' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    lectureId,
    source: source ?? 'zoom',
    nodePath,
    nodeLabel,
    flagged: shouldFlag,
    dryRun: process.env.INGEST_DRY_RUN === 'true',
  })
}
