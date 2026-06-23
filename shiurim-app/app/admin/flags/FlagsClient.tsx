'use client'

import { useState, useTransition } from 'react'
import { dismissFlag, moveFlag } from './actions'

type FolderNode = { id: string; label: string; icon?: string; children?: FolderNode[] }
type Flag = {
  id: string
  shiur_id: string
  proposed_path: string[]
  alternatives: string[][]
  confidence: string
  tier: number
  created_at: string
  pending_lectures: {
    id: string
    title: string
    speaker: string
    date: string
    audio_url: string
  }
}

function flattenNodes(
  nodes: FolderNode[],
  prefix: string[] = [],
): { path: string[]; label: string }[] {
  return nodes.flatMap(n => {
    const path = [...prefix, n.id]
    const own = { path, label: [...prefix.map(p => p), n.label].join(' → ') }
    return [own, ...flattenNodes(n.children ?? [], path)]
  })
}

export default function FlagsClient({
  flags,
  hierarchy,
}: {
  flags: Flag[]
  hierarchy: { categories: FolderNode[] }
}) {
  const [, startTransition] = useTransition()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')

  const allPaths = flattenNodes(hierarchy.categories)
  const filtered = allPaths.filter(p =>
    p.label.toLowerCase().includes(search.toLowerCase()),
  )

  const visible = flags.filter(f => !dismissed.has(f.id))

  if (visible.length === 0) {
    return <div className="p-8 text-center text-gray-500">No open flags</div>
  }

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Categorization Flags ({visible.length} open)</h1>
      {visible.map(flag => (
        <FlagCard
          key={flag.id}
          flag={flag}
          allPaths={filtered}
          search={search}
          setSearch={setSearch}
          onDismiss={() => {
            setDismissed(prev => new Set(prev).add(flag.id))
            startTransition(() => dismissFlag(flag.id))
          }}
          onMove={(newPath: string[]) => {
            setDismissed(prev => new Set(prev).add(flag.id))
            startTransition(() => moveFlag(flag.id, flag.shiur_id, newPath))
          }}
        />
      ))}
    </div>
  )
}

function FlagCard({
  flag,
  allPaths,
  search,
  setSearch,
  onDismiss,
  onMove,
}: {
  flag: Flag
  allPaths: { path: string[]; label: string }[]
  search: string
  setSearch: (s: string) => void
  onDismiss: () => void
  onMove: (path: string[]) => void
}) {
  const shiur = flag.pending_lectures
  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div>
        <p className="font-semibold text-lg">{shiur.title}</p>
        <p className="text-sm text-gray-600">{shiur.speaker} · {shiur.date}</p>
        <p className="text-xs text-gray-400">
          Proposed: {flag.proposed_path.join(' → ')} · Confidence: {flag.confidence} · Tier {flag.tier}
        </p>
      </div>

      {/* Quick-select suggested alternatives */}
      {flag.alternatives?.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-medium text-gray-700">AI suggestions:</p>
          {flag.alternatives.map((alt, i) => (
            <button
              key={i}
              onClick={() => onMove(alt)}
              className="block text-sm text-blue-600 hover:underline"
            >
              → {alt.join(' → ')}
            </button>
          ))}
        </div>
      )}

      {/* Searchable tree select */}
      <div className="space-y-1">
        <input
          type="text"
          placeholder="Search folders..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full border rounded px-3 py-1.5 text-sm"
        />
        {search && (
          <div className="max-h-48 overflow-y-auto border rounded divide-y text-sm">
            {allPaths.slice(0, 20).map(({ path, label }) => (
              <button
                key={path.join('/')}
                onClick={() => { onMove(path); setSearch('') }}
                className="block w-full text-left px-3 py-1.5 hover:bg-gray-50"
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={onDismiss}
          className="px-4 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-sm"
        >
          Dismiss (keep placement)
        </button>
        <audio src={shiur.audio_url} controls className="h-8 flex-1" />
      </div>
    </div>
  )
}
