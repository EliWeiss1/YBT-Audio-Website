'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(false)
  const [checking, setChecking] = useState(true)
  const [hasSession, setHasSession] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getSession().then(({ data }) => {
      setHasSession(!!data.session)
      setChecking(false)
    })
  }, [])

  const handleSubmit = async () => {
    setError(''); setMessage('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setMessage('Password updated! Redirecting...')
      setTimeout(() => router.push('/lectures'), 1200)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">📚</div>
          <h1 className="text-2xl font-bold text-stone-900">Shiurim Library</h1>
          <p className="text-stone-500 text-sm mt-1">Choose a new password</p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
          {checking ? (
            <p className="text-stone-500 text-sm text-center">Loading...</p>
          ) : !hasSession ? (
            <div className="space-y-3 text-center">
              <p className="text-red-600 text-sm">
                This password reset link is invalid or has expired.
              </p>
              <Link href="/auth"
                className="inline-block text-emerald-700 font-medium text-sm hover:underline">
                Request a new reset link
              </Link>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">New password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-sm
                             focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-600 mb-1.5">Confirm password</label>
                <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-sm
                             focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400" />
              </div>

              {error && <p className="text-red-600 text-xs">{error}</p>}
              {message && <p className="text-emerald-600 text-xs">{message}</p>}

              <button onClick={handleSubmit} disabled={loading || !password || !confirm}
                className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50
                           text-white font-medium text-sm rounded-lg transition-colors">
                {loading ? 'Please wait...' : 'Update password'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
