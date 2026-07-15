'use client'

import { useEffect, useRef, useState } from 'react'

/** Generic local-state multi-select pill dropdown. Unlike RabbiFilter in
 *  app/lectures/LecturesClient.tsx (which encodes selection into the URL via
 *  Link hrefs), this reports selection changes through onChange so callers
 *  that keep filters in plain component state can reuse the same dropdown UI. */
export default function MultiSelectFilter({
  emptyLabel,
  pluralNoun,
  allLabel,
  options,
  selected,
  onChange,
}: {
  emptyLabel: string
  pluralNoun: string
  allLabel: string
  options: string[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])

  if (options.length < 2 && selected.length === 0) return null

  function toggle(option: string) {
    onChange(
      selected.includes(option)
        ? selected.filter(o => o !== option)
        : [...selected, option]
    )
  }

  const label = selected.length === 0
    ? emptyLabel
    : selected.length === 1
      ? selected[0]
      : `${selected.length} ${pluralNoun}`

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border transition-colors
          ${selected.length > 0
            ? 'bg-emerald-700 text-white border-emerald-700'
            : 'border-stone-200 text-stone-500 hover:border-stone-300 hover:text-stone-700'}`}
      >
        {label}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-20 bg-white border border-stone-200 rounded-lg shadow-sm overflow-hidden min-w-[180px]">
          <button
            onClick={() => onChange([])}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left
              ${selected.length === 0 ? 'bg-emerald-50 text-emerald-800' : 'text-stone-700 hover:bg-stone-50'}`}
          >
            <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0
              ${selected.length === 0 ? 'bg-emerald-700 border-emerald-700' : 'border-stone-300'}`}>
              {selected.length === 0 && (
                <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                </svg>
              )}
            </span>
            {allLabel}
          </button>
          <div className="overflow-y-auto" style={{ maxHeight: '240px' }}>
            {options.map(option => {
              const isSelected = selected.includes(option)
              return (
                <button
                  key={option}
                  onClick={() => toggle(option)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors text-left
                    ${isSelected ? 'bg-emerald-50 text-emerald-800' : 'text-stone-700 hover:bg-stone-50'}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center shrink-0
                    ${isSelected ? 'bg-emerald-700 border-emerald-700' : 'border-stone-300'}`}>
                    {isSelected && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 12 12">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                      </svg>
                    )}
                  </span>
                  {option}
                </button>
              )
            })}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-stone-100">
              <button
                onClick={() => { onChange([]); setOpen(false) }}
                className="block w-full text-left px-3 py-2 text-xs text-stone-400 hover:text-stone-600 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
