import { createClient } from '@supabase/supabase-js'
import type { PendingLecture } from './types'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function writePendingLecture(lecture: PendingLecture): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would insert pending_lecture:', JSON.stringify(lecture, null, 2))
    return
  }
  const supabase = getServiceClient()
  // node_label is only present for auto-created nodes (Drive per-rabbi fallback); default
  // to null so the column exists in the row shape regardless of source.
  const { error } = await supabase.from('pending_lectures').insert({ node_label: null, ...lecture })
  if (error) throw new Error(`pending_lectures insert failed: ${error.message}`)
}

export async function writeFailedIngestion(failure: {
  senderEmail: string
  rawTitle: string
  rawRabbi: string
  zoomShareUrl: string
  failureReason: string
  rawEmailSnippet: string
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would insert failed_ingestion:', failure)
    return
  }
  const supabase = getServiceClient()
  await supabase.from('failed_ingestions').insert({
    sender_email: failure.senderEmail,
    raw_title: failure.rawTitle,
    raw_rabbi: failure.rawRabbi,
    zoom_share_url: failure.zoomShareUrl,
    failure_reason: failure.failureReason,
    raw_email_snippet: failure.rawEmailSnippet,
  })
}

export async function writeCategoryFlag(flag: {
  shiurId: string
  proposedPath: string[]
  alternatives: string[][]
  tier: number
  confidence: 'high' | 'low'
}): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would insert categorization_flag:', flag)
    return
  }
  const supabase = getServiceClient()
  await supabase.from('categorization_flags').insert({
    shiur_id: flag.shiurId,
    proposed_path: flag.proposedPath,
    alternatives: flag.alternatives,
    categorization_tier: flag.tier,
    confidence: flag.confidence,
  })
}

export async function triggerDeploy(): Promise<void> {
  const hookUrl = process.env.VERCEL_DEPLOY_HOOK_URL
  if (!hookUrl) return
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] Would trigger deploy hook:', hookUrl)
    return
  }
  await fetch(hookUrl, { method: 'POST' })
}
