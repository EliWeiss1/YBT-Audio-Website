'use client'

import { useEffect, useRef, useState, type CSSProperties } from 'react'

export type DateRangeValue = { from: string | null; to: string | null }

type Accent = 'indigo' | 'emerald'

const ACCENT_CLASSES: Record<Accent, {
  activePill: string
  idlePill: string
  activeRow: string
  idleRow: string
  dot: string
  inputFocus: string
}> = {
  indigo: {
    activePill: 'bg-[#EEEDFE] text-[#3C3489] border-[#AFA9EC]',
    idlePill: 'bg-white text-stone-600 border-stone-200 hover:bg-stone-50',
    activeRow: 'bg-[#EEEDFE] text-[#3C3489]',
    idleRow: 'text-stone-700 hover:bg-stone-50',
    dot: 'bg-[#534AB7] border-[#534AB7]',
    inputFocus: 'focus:border-[#534AB7] focus:ring-1 focus:ring-[#534AB7]/30',
  },
  emerald: {
    activePill: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    idlePill: 'bg-white text-stone-500 border-stone-200 hover:border-stone-300',
    activeRow: 'bg-emerald-50 text-emerald-800',
    idleRow: 'text-stone-700 hover:bg-stone-50',
    dot: 'bg-emerald-600 border-emerald-600',
    inputFocus: 'focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400/30',
  },
}

// Dates compare fine as plain YYYY-MM-DD strings (matches Lecture.date), so
// presets are built the same way — local-time arithmetic, no UTC shift.
function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateStr(d)
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return toDateStr(d)
}

function formatShort(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

const PRESETS: { key: string; label: string; from: () => string | null }[] = [
  { key: 'all', label: 'All time', from: () => null },
  { key: '30d', label: 'Last 30 days', from: () => daysAgo(30) },
  { key: '6m', label: 'Last 6 months', from: () => monthsAgo(6) },
  { key: '1y', label: 'Last year', from: () => monthsAgo(12) },
]

function matchingPresetKey(value: DateRangeValue): string | null {
  if (value.to !== null) return null
  return PRESETS.find(p => p.from() === value.from)?.key ?? null
}

export default function DateRangeFilter({
  value,
  onChange,
  accent = 'indigo',
}: {
  value: DateRangeValue
  onChange: (value: DateRangeValue) => void
  accent?: Accent
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const [dropdownStyle, setDropdownStyle] = useState<CSSProperties>({ right: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const c = ACCENT_CLASSES[accent]

  // Picks whichever side keeps the dropdown fully on-screen — the pill can
  // sit anywhere from flush-left to flush-right depending on the surface
  // (nav search filter bar vs. rabbi page) and the viewport width, so a
  // fixed left-0/right-0 anchor clips on some combination of the two.
  useEffect(() => {
    if (!isOpen || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const margin = 24
    const vw = window.innerWidth
    const width = Math.min(288, vw - margin * 2)

    if (rect.right - width >= margin) {
      setDropdownStyle({ right: 0 })
    } else if (rect.left + width <= vw - margin) {
      setDropdownStyle({ left: 0 })
    } else {
      const desiredLeft = Math.max(margin, Math.min(vw - width - margin, rect.left - (width - rect.width) / 2))
      setDropdownStyle({ left: desiredLeft - rect.left })
    }
  }, [isOpen])

  const isActive = value.from !== null || value.to !== null
  const activePreset = matchingPresetKey(value)
  const isCustom = isActive && activePreset === null

  // Custom row auto-expands once a non-preset range is active, so reopening
  // the dropdown doesn't hide the very range that's currently applied.
  useEffect(() => {
    if (isCustom) setCustomOpen(true)
  }, [isCustom])

  // 'click' (not 'mousedown') plus an activeElement fallback — clicking the
  // native <input type="date">'s spin arrows or calendar popup can report a
  // target that briefly resolves outside this container while focus is
  // still legitimately on the input, which was closing the dropdown before
  // the user finished picking both ends of a custom range.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Node
      const active = document.activeElement
      const inside = containerRef.current?.contains(target) || (!!active && !!containerRef.current?.contains(active))
      if (!inside) setIsOpen(false)
    }
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [])

  let label = 'Date range'
  if (activePreset && activePreset !== 'all') {
    label = PRESETS.find(p => p.key === activePreset)!.label
  } else if (isCustom) {
    if (value.from && value.to) label = `${formatShort(value.from)} – ${formatShort(value.to)}`
    else if (value.from) label = `From ${formatShort(value.from)}`
    else label = `Until ${formatShort(value.to!)}`
  }

  function selectPreset(key: string) {
    const preset = PRESETS.find(p => p.key === key)!
    onChange({ from: preset.from(), to: null })
    setCustomOpen(false)
    setIsOpen(false)
  }

  // Keep from/to from crossing — nudging one past the other moves the far
  // side along with it instead of producing an inverted (invalid) range.
  function setCustomFrom(from: string) {
    onChange({ from, to: value.to && from > value.to ? from : value.to })
  }

  function setCustomTo(to: string) {
    onChange({ from: value.from && to < value.from ? to : value.from, to })
  }

  function clear() {
    onChange({ from: null, to: null })
    setCustomOpen(false)
  }

  return (
    <div className="relative shrink-0" ref={containerRef}>
      <button
        onClick={() => setIsOpen(o => !o)}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap
          ${isActive ? c.activePill : c.idlePill}`}
      >
        {label}
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div
          className="absolute top-full mt-1 w-72 max-w-[calc(100vw-2rem)] bg-white border border-stone-200 rounded-lg shadow-md z-50 overflow-hidden"
          style={dropdownStyle}
        >
          <div className="py-1">
            {PRESETS.map(p => {
              const selected = activePreset === p.key
              return (
                <button
                  key={p.key}
                  onClick={() => selectPreset(p.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${selected ? c.activeRow : c.idleRow}`}
                >
                  <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${selected ? c.dot : 'border-stone-300'}`}>
                    {selected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                  </span>
                  {p.label}
                </button>
              )
            })}
          </div>

          <div className="border-t border-stone-100">
            <button
              onClick={() => setCustomOpen(o => !o)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors ${isCustom ? c.activeRow : c.idleRow}`}
            >
              <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center shrink-0 transition-colors ${isCustom ? c.dot : 'border-stone-300'}`}>
                {isCustom && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
              </span>
              Custom range
              <svg className={`w-3 h-3 ml-auto text-stone-400 transition-transform ${customOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {customOpen && (
              <div className="px-3 pb-3 pt-1 flex items-center gap-2">
                <label className="flex-1 text-[11px] text-stone-400">
                  From
                  <input
                    type="date"
                    value={value.from ?? ''}
                    max={value.to ?? undefined}
                    onChange={e => e.target.value && setCustomFrom(e.target.value)}
                    className={`mt-0.5 w-full px-2 py-1.5 text-xs text-stone-700 bg-stone-50 border border-stone-200 rounded-md focus:outline-none ${c.inputFocus}`}
                  />
                </label>
                <span className="text-stone-300 mt-4">–</span>
                <label className="flex-1 text-[11px] text-stone-400">
                  To
                  <input
                    type="date"
                    value={value.to ?? ''}
                    min={value.from ?? undefined}
                    onChange={e => e.target.value && setCustomTo(e.target.value)}
                    className={`mt-0.5 w-full px-2 py-1.5 text-xs text-stone-700 bg-stone-50 border border-stone-200 rounded-md focus:outline-none ${c.inputFocus}`}
                  />
                </label>
              </div>
            )}
          </div>

          {isActive && (
            <div className="border-t border-stone-100">
              <button
                onClick={clear}
                className="w-full px-3 py-2 text-xs text-stone-400 hover:text-stone-600 text-left transition-colors"
              >
                Clear
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
