import { NextRequest, NextResponse } from 'next/server'
import { insertSuggestion, attachGithubIssue } from '@/lib/feedback/writer'
import { createSuggestionIssue } from '@/lib/feedback/github-issues'

export const runtime = 'nodejs'

const MAX_DESCRIPTION_LENGTH = 5000

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const type = body?.type
  const description = body?.description

  if (type !== 'bug' && type !== 'feature') {
    return NextResponse.json({ error: 'type must be "bug" or "feature"' }, { status: 400 })
  }
  if (typeof description !== 'string' || description.trim().length === 0) {
    return NextResponse.json({ error: 'description is required' }, { status: 400 })
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: 'description is too long' }, { status: 400 })
  }

  const suggestionId = await insertSuggestion({ type, description: description.trim() })

  // Fail-soft: a GitHub API problem shouldn't stop the visitor's submission
  // from succeeding — the row is already saved and visible on /admin/suggestions.
  const issue = await createSuggestionIssue({ type, description: description.trim() })
  if (issue) {
    await attachGithubIssue(suggestionId, issue)
  }

  return NextResponse.json({ ok: true })
}
