import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase-server'
import { listSuggestions } from '@/lib/feedback/writer'
import { getIssueState } from '@/lib/feedback/github-issues'

export default async function AdminSuggestionsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user || user.id !== process.env.ADMIN_USER_ID) {
    redirect('/auth')
  }

  const suggestions = await listSuggestions()
  const states = await Promise.all(
    suggestions.map(s => s.github_issue_number ? getIssueState(s.github_issue_number) : Promise.resolve(null)),
  )

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Suggestions ({suggestions.length})</h1>
      {suggestions.length === 0 && (
        <div className="p-8 text-center text-gray-500">No submissions yet</div>
      )}
      {suggestions.map((s, i) => {
        const state = states[i]
        return (
          <div key={s.id} className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                ${s.type === 'bug' ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {s.type === 'bug' ? 'Bug' : 'Feature'}
              </span>
              {state && (
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
                  ${state === 'open' ? 'bg-blue-50 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>
                  {state === 'open' ? 'Open' : 'Closed'}
                </span>
              )}
              {!s.github_issue_number && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-700">
                  No issue filed
                </span>
              )}
              <span className="text-xs text-gray-400 ml-auto">
                {new Date(s.created_at).toLocaleString()}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{s.description}</p>
            <p className="text-xs text-gray-500">By {s.submitted_by ?? 'Anonymous'}</p>
            {s.github_issue_url && (
              <a href={s.github_issue_url} target="_blank" rel="noreferrer"
                className="text-sm text-blue-600 hover:underline">
                View on GitHub →
              </a>
            )}
          </div>
        )
      })}
    </div>
  )
}
