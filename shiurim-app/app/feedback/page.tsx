'use client'

import { useState } from 'react'

export default function FeedbackPage() {
  const [type, setType] = useState<'bug' | 'feature'>('feature')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle')

  async function handleSubmit() {
    setStatus('submitting')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, description }),
      })
      if (!res.ok) throw new Error('request failed')
      setStatus('done')
      setDescription('')
    } catch {
      setStatus('error')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">💬</div>
          <h1 className="text-2xl font-bold text-stone-900">Feedback</h1>
          <p className="text-stone-500 text-sm mt-1">Report a bug or request a feature</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
          {status === 'done' ? (
            <p className="text-emerald-600 text-sm text-center py-4">
              Thanks — your feedback has been submitted.
            </p>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Type</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('feature')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                      ${type === 'feature'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                  >
                    Feature request
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('bug')}
                    className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors
                      ${type === 'bug'
                        ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                        : 'border-stone-200 text-stone-600 hover:bg-stone-50'}`}
                  >
                    Bug report
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Description</label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  rows={5}
                  placeholder={type === 'bug' ? "What went wrong?" : "What would you like to see?"}
                  className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-sm resize-none
                             focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                />
              </div>

              {status === 'error' && (
                <p className="text-red-600 text-xs">Something went wrong. Please try again.</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={status === 'submitting' || !description.trim()}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50
                           text-white font-medium text-sm rounded-lg transition-colors"
              >
                {status === 'submitting' ? 'Submitting...' : 'Submit'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
