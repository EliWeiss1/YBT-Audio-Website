'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase-browser'
import { useRouter, useSearchParams } from 'next/navigation'

export default function AuthPage() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const searchParams = useSearchParams()
  const [message, setMessage] = useState('')
  const linkError = searchParams.get('error') === 'invalid-link'

  const handleSubmit = async () => {
    setError(''); setMessage(''); setLoading(true)
    const supabase = createClient()

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: name } }
      })
      if (error) setError(error.message)
      else setMessage('Check your email for a confirmation link!')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
      else router.push('/lectures')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="text-4xl mb-3">📚</div>
          <h1 className="text-2xl font-bold text-stone-900">Shiurim Library</h1>
          <p className="text-stone-500 text-sm mt-1">
            {mode === 'signin' ? 'Sign in to track your progress' : 'Create your account'}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-stone-200 shadow-sm p-6 space-y-4">
          {mode === 'signup' && (
            <div>
              <label className="block text-xs font-medium text-stone-600 mb-1.5">Display name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Your name"
                className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-sm
                           focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400" />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-sm
                         focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-600 mb-1.5">Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              className="w-full px-4 py-2.5 rounded-lg border border-stone-200 text-sm
                         focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400" />
          </div>

          {(error || linkError) && (
            <p className="text-red-600 text-xs">
              {linkError ? 'This confirmation link is invalid or has expired. Please sign up again.' : error}
            </p>
          )}
          {message && <p className="text-emerald-600 text-xs">{message}</p>}

          <button onClick={handleSubmit} disabled={loading || !email || !password}
            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50
                       text-white font-medium text-sm rounded-lg transition-colors">
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign In' : 'Create Account'}
          </button>
        </div>

        <p className="text-center text-sm text-stone-500 mt-4">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
            className="text-emerald-700 font-medium hover:underline">
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  )
}
