'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase-browser'
import { markAppLoaded } from '@/lib/app-session'
import Sidebar from './Sidebar'
import ProfileDrawer from './ProfileDrawer'
import NavSearch from './NavSearch'
import type { User } from '@supabase/supabase-js'

export default function LayoutShell({
  children,
  user: initialUser,
}: {
  children: React.ReactNode
  user: User | null
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [mobileSearchActive, setMobileSearchActive] = useState(false)
  const [user, setUser] = useState<User | null>(initialUser)
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => { setSidebarOpen(false) }, [pathname])

  // Marks that the app shell has mounted in this tab session — see lib/app-session.ts
  useEffect(() => {
    markAppLoaded()
  }, [])

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
      <ProfileDrawer user={user} onSignOut={handleSignOut} />
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
      <div className="hidden md:flex md:h-screen">
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

        {/* Top bar */}
        <header className="relative flex items-center gap-3 px-4 py-3 bg-white border-b border-stone-200 shrink-0 safe-top">
          {/* Left: hamburger + title (mobile only, hidden when mobile search is active) */}
          {!mobileSearchActive && (
            <div className="flex items-center gap-3 md:hidden shrink-0">
              <button
                onClick={() => setSidebarOpen(true)}
                className="p-2 rounded-lg text-stone-500 hover:bg-stone-100 transition-colors"
                aria-label="Open menu"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <span className="font-semibold text-stone-900 text-sm">YBT Shiurim</span>
            </div>
          )}

          {/* NavSearch: desktop = centered bar, mobile = icon / expanded */}
          <NavSearch onMobileSearchChange={setMobileSearchActive} />

          {/* Right: auth (hidden on mobile when mobile search is active) */}
          {!mobileSearchActive && (
            <div className="shrink-0 ml-auto md:ml-2">
              <AuthButton />
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto pb-28">
          {children}
        </main>
      </div>
    </div>
  )
}
