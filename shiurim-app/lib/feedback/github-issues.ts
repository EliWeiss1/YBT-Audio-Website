// Files a GitHub Issue for each suggestion-box submission. Uses a dedicated
// GITHUB_ISSUES_TOKEN (scoped to Issues: Read and write) rather than
// GITHUB_DISPATCH_TOKEN, which is scoped only for repository_dispatch
// (see lib/ingest/github-dispatch.ts).

const GITHUB_API_HEADERS = {
  Authorization: `Bearer ${process.env.GITHUB_ISSUES_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
}

export async function createSuggestionIssue(opts: {
  type: 'bug' | 'feature'
  description: string
  submittedBy: string | null
}): Promise<{ number: number; url: string } | null> {
  const prefix = opts.type === 'bug' ? '[Bug]' : '[Feature]'
  const title = `${prefix} ${opts.description.slice(0, 60)}`
  const body = `${opts.description}\n\n---\nSubmitted by: ${opts.submittedBy ?? 'Anonymous'}`

  try {
    const res = await fetch(`https://api.github.com/repos/${process.env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: GITHUB_API_HEADERS,
      body: JSON.stringify({
        title,
        body,
        labels: [opts.type === 'bug' ? 'bug' : 'enhancement', 'suggestion-box'],
      }),
    })
    if (!res.ok) {
      console.error(`createSuggestionIssue: GitHub API returned ${res.status}: ${await res.text()}`)
      return null
    }
    const data = await res.json()
    return { number: data.number, url: data.html_url }
  } catch (e) {
    console.error('createSuggestionIssue: failed to create GitHub issue', e)
    return null
  }
}

export async function getIssueState(issueNumber: number): Promise<'open' | 'closed' | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPO}/issues/${issueNumber}`,
      { headers: GITHUB_API_HEADERS, cache: 'no-store' },
    )
    if (!res.ok) return null
    const data = await res.json()
    return data.state === 'closed' ? 'closed' : 'open'
  } catch (e) {
    console.error('getIssueState: failed to fetch issue state', e)
    return null
  }
}
