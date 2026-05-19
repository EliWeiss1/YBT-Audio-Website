'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase-browser'

type Props = {
  lectureId: string
  defaultSpeaker: string
  allRabbis: string[]
}

export default function SpeakerEditor({ lectureId, defaultSpeaker, allRabbis }: Props) {
  const [currentSpeaker, setCurrentSpeaker] = useState(defaultSpeaker)
  const [isOpen, setIsOpen] = useState(false)
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const supabase = createClient()

    // Check auth
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsLoggedIn(!!user)
    })

    // Fetch any existing override
    fetch(`/api/lectures/${encodeURIComponent(lectureId)}/speaker`)
      .then(r => r.json())
      .then(d => { if (d.speaker) setCurrentSpeaker(d.speaker) })
      .catch(() => {})
  }, [lectureId])

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  async function selectRabbi(rabbi: string) {
    if (rabbi === currentSpeaker) { setIsOpen(false); return }
    setIsOpen(false)
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/lectures/${encodeURIComponent(lectureId)}/speaker`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ speaker: rabbi }),
      })
      if (res.ok) {
        setCurrentSpeaker(rabbi)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      }
    } finally {
      setSaving(false)
    }
  }

  if (!currentSpeaker && !defaultSpeaker) return null

  // Build list: ensure current speaker is always present even if not in allRabbis
  // allRabbis is pre-sorted by count from the server; keep that order, append current if missing
  const knownSet = new Set(allRabbis)
  const options = knownSet.has(currentSpeaker)
    ? allRabbis
    : [...allRabbis, currentSpeaker].filter(Boolean)

  return (
    <div className="relative inline-flex items-center gap-1.5" ref={dropdownRef}>
      <span className="text-base">🎓</span>
      <span className={`transition-opacity ${saving ? 'opacity-40' : 'opacity-100'}`}>
        {currentSpeaker || defaultSpeaker}
      </span>

      {saved && (
        <span className="text-xs text-emerald-600 font-medium">✓ saved</span>
      )}

      {isLoggedIn && !saving && (
        <button
          onClick={() => setIsOpen(o => !o)}
          aria-label="Change rabbi"
          title="Change rabbi"
          className={`ml-0.5 rounded px-0.5 text-stone-400 hover:text-stone-700 hover:bg-stone-100
                      transition-colors text-xs leading-none ${isOpen ? 'text-stone-700 bg-stone-100' : ''}`}
        >
          ▾
        </button>
      )}

      {isOpen && (
        <div
          className="absolute top-full left-0 mt-1.5 bg-white border border-stone-200 rounded-xl
                     shadow-lg z-50 min-w-[200px] max-h-72 overflow-y-auto py-1"
        >
          <p className="px-3 py-1.5 text-xs text-stone-400 font-medium uppercase tracking-wide border-b border-stone-100 mb-1">
            Select Rabbi
          </p>
          {options.map(rabbi => (
            <button
              key={rabbi}
              onClick={() => selectRabbi(rabbi)}
              className={`w-full text-left px-3 py-2 text-sm transition-colors
                ${rabbi === currentSpeaker
                  ? 'bg-emerald-50 text-emerald-700 font-semibold'
                  : 'text-stone-700 hover:bg-emerald-50 hover:text-emerald-800'}`}
            >
              {rabbi === currentSpeaker && (
                <span className="mr-1.5 text-emerald-500">✓</span>
              )}
              {rabbi}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
