'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import Sidebar from './Sidebar'
import type { User } from '@supabase/supabase-js'

export default function LayoutShell({
  children,
  user: initialUser,
}: {
  children: React.ReactNode
  user: User | null
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [user, setUser] = useState<User | null>(initialUser)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // Keep auth state in sync with Supabase session changes
  useEffect(() => {
    const supabase = createClient()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  const AuthButton = () =>
    user ? (
      <div className="flex items-center gap-2">
        <span className="text-xs text-stone-500 hidden sm:block truncate max-w-[140px]">{user.email}</span>
        <button
          onClick={handleSignOut}
          className="px-3 py-1.5 text-xs font-medium text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    ) : (
      <Link
        href="/auth"
        className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg transition-colors"
      >
        Login / Sign Up
      </Link>
    )

  return (
    <div className="flex h-screen bg-stone-50 text-stone-900">

      {/* ── Desktop sidebar (always visible ≥ md) ── */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* ── Mobile drawer backdrop ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Mobile drawer ── */}
      <div className={`
        fixed inset-y-0 left-0 z-50 md:hidden
        transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <Sidebar onClose={() => setSidebarOpen(false)} />
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top bar — mobile gets hamburger + title, desktop gets just the auth button */}
        <header className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-stone-200 shrink-0">
          {/* Left: hamburger (mobile only) + title (mobile only) */}
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 transition-colors"
              aria-label="Open menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-semibold text-stone-900 text-sm">📚 Shiurim Library</span>
          </div>

          {/* Spacer so auth button always floats right */}
          <div className="hidden md:block" />

          {/* Right: auth */}
          <AuthButton />
        </header>

        <main className="flex-1 overflow-y-auto pb-28">
          {children}
        </main>
      </div>
    </div>
  )
}
