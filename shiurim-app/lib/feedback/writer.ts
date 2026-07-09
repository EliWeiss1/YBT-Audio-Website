import { createClient } from '@supabase/supabase-js'

export type Suggestion = {
  id: string
  type: 'bug' | 'feature'
  description: string
  github_issue_number: number | null
  github_issue_url: string | null
  created_at: string
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function insertSuggestion(opts: {
  type: 'bug' | 'feature'
  description: string
}): Promise<string> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('suggestions')
    .insert({ type: opts.type, description: opts.description })
    .select('id')
    .single()
  if (error) throw new Error(`suggestions insert failed: ${error.message}`)
  return data.id
}

export async function attachGithubIssue(
  suggestionId: string,
  issue: { number: number; url: string },
): Promise<void> {
  const supabase = getServiceClient()
  await supabase
    .from('suggestions')
    .update({ github_issue_number: issue.number, github_issue_url: issue.url })
    .eq('id', suggestionId)
}

export async function listSuggestions(): Promise<Suggestion[]> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('suggestions')
    .select('*')
    .order('created_at', { ascending: false })
  return data ?? []
}
