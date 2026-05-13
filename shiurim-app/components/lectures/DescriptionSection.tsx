'use client'

import { useState } from 'react'
import { upsertLectureDescription } from '@/lib/supabase'

type Props = {
  lectureId: string
  initialDescription: string   // merged: Supabase value if exists, else JSON fallback
  userId?: string
}

export default function DescriptionSection({ lectureId, initialDescription, userId }: Props) {
  const [description, setDescription] = useState(initialDescription)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(initialDescription)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSave = async () => {
    if (!userId) return
    setSaving(true)
    setError(null)
    const { error } = await upsertLectureDescription(lectureId, userId, draft.trim())
    if (error) {
      setError('Failed to save — please try again.')
    } else {
      setDescription(draft.trim())
      setEditing(false)
    }
    setSaving(false)
  }

  const handleCancel = () => {
    setDraft(description)
    setEditing(false)
    setError(null)
  }

  if (!userId) {
    // Logged-out: just show description (or nothing if empty)
    if (!description) return null
    return (
      <div className="text-stone-600 leading-relaxed mb-8 bg-stone-50 rounded-xl p-4 border border-stone-100">
        <p className="text-sm">{description}</p>
      </div>
    )
  }

  if (editing) {
    return (
      <div className="mb-8">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          autoFocus
          placeholder="Write a description for this shiur — topic, key ideas, context..."
          className="w-full px-4 py-3 rounded-xl border border-stone-200 text-sm text-stone-700
                     leading-relaxed resize-none focus:outline-none focus:border-emerald-400
                     focus:ring-1 focus:ring-emerald-400 bg-stone-50"
        />
        {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
        <div className="flex gap-2 mt-2 justify-end">
          <button
            onClick={handleCancel}
            className="px-4 py-1.5 text-sm text-stone-500 hover:text-stone-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !draft.trim()}
            className="px-5 py-1.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50
                       text-white text-sm font-medium rounded-lg transition-colors"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-8 group relative">
      {description ? (
        <div className="bg-stone-50 rounded-xl p-4 border border-stone-100">
          <p className="text-sm text-stone-600 leading-relaxed">{description}</p>
          <button
            onClick={() => { setDraft(description); setEditing(true) }}
            className="mt-3 text-xs text-stone-400 hover:text-emerald-700 transition-colors flex items-center gap-1"
          >
            ✏️ Edit description
          </button>
        </div>
      ) : (
        <button
          onClick={() => { setDraft(''); setEditing(true) }}
          className="w-full py-3 px-4 rounded-xl border border-dashed border-stone-200
                     text-sm text-stone-400 hover:text-emerald-700 hover:border-emerald-300
                     hover:bg-emerald-50 transition-all text-left"
        >
          + Add a description for this shiur
        </button>
      )}
    </div>
  )
}
