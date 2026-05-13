'use client'

import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'
import Sidebar from './Sidebar'

export default function LayoutShell({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const pathname = usePathname()

  // Close sidebar on navigation
  useEffect(() => { setSidebarOpen(false) }, [pathname])

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

        {/* Mobile top bar */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-stone-200 shrink-0">
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
        </header>

        <main className="flex-1 overflow-y-auto pb-28">
          {children}
        </main>
      </div>
    </div>
  )
}
