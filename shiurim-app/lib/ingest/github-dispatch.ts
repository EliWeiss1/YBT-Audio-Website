import type { RecordingPlan } from './types'

export type BrowserIngestPayload = {
  lectureId: string
  shareUrl: string
  title: string
  rabbi: string
  description: string
  date: string
  senderEmail: string
  rawEmailSnippet: string
  // Multi-recording plan (merge/separate + titles), when the rebbe specified one.
  // Passed through to the browser worker; null/omitted = single-recording behavior.
  recordings?: RecordingPlan | null
}

// Fire a repository_dispatch to kick off the GitHub Actions "zoom-ingest" worker,
// which drives a headless browser to download the passcode-protected Zoom recording.
export async function dispatchBrowserIngest(p: BrowserIngestPayload): Promise<void> {
  if (process.env.INGEST_DRY_RUN === 'true') {
    console.log('[DRY RUN] repository_dispatch zoom-ingest', p.lectureId)
    return
  }

  const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/dispatches`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_DISPATCH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: JSON.stringify({ event_type: 'zoom-ingest', client_payload: p }),
  })

  if (!res.ok) {
    throw new Error(`GitHub dispatch failed: ${res.status} ${await res.text()}`)
  }
}
