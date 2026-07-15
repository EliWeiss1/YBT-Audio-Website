# Recently Given Rabbi + Folder Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rabbi and top-level-folder multi-select filter dropdowns to the homepage's "Recently Given" section so a visitor can narrow the 200 most recent shiurim to one rabbi, one subject folder, or a combination, without leaving the page.

**Architecture:** A new generic `MultiSelectFilter` presentational component (local `useState`-driven, no URL params) is extracted from the existing `RabbiFilter` pattern in `app/lectures/LecturesClient.tsx`, decoupled from `Link`/URL-encoding so it can be driven by a plain `onChange` callback. `RecentlyGiven.tsx` uses two instances of it (rabbi, folder), derives filtered results with `useMemo` from the full 200-lecture pool it already receives as a prop, and resets pagination to the first page whenever a filter changes.

**Tech Stack:** Next.js App Router, React 18 client components, Tailwind CSS. No new dependencies.

## Global Constraints

- Filters are local component state only — no URL query params, no server round-trip (spec: "Non-goals").
- Filtering always operates against the full 200-lecture pool already passed into `RecentlyGiven`, never against the currently-visible slice (spec: "Goals" — changing a filter must immediately show up to 15 matches).
- Folder filter is top-level category only (`breadcrumb[0]`), not deep/sub-node (spec: "Non-goals").
- Both filters are multi-select, combined with AND logic between rabbi and folder (spec: "Behavior").
- Rabbi options: unique post-override normalized speaker names, sorted alphabetically (spec: "Data").
- Folder options: unique top-level categories present in the pool, ordered to match the canonical `categories` array order from `lib/lectures.ts`, not alphabetically (spec: "Data").
- No new automated test coverage — this repo's Vitest coverage is scoped to the ingest/zoom pipeline, and no sibling component (e.g. `RabbiFilter`) has existing tests to extend (spec: "Testing"). Verification is manual, in-browser, via `npm run dev`.
- Do not touch `app/page.tsx`'s 200-lecture slice, the ingest pipelines, or any file outside `components/lectures/` and `app/page.tsx`.

---

### Task 1: Create the generic `MultiSelectFilter` component

**Files:**
- Create: `shiurim-app/components/lectures/MultiSelectFilter.tsx`

**Interfaces:**
- Consumes: nothing project-specific — pure presentational component.
- Produces: default export `MultiSelectFilter` with props:
  ```ts
  {
    emptyLabel: string      // shown on the button when nothing is selected, e.g. "Rabbi"
    pluralNoun: string      // used when 2+ selected, e.g. "3 rabbis"
    allLabel: string        // label of the "clear/select all" row, e.g. "All rabbis"
    options: string[]
    selected: string[]
    onChange: (next: string[]) => void
  }
  ```
  Later tasks (Task 2) import this as `import MultiSelectFilter from './MultiSelectFilter'`.

- [ ] **Step 1: Write the component**

Create `shiurim-app/components/lectures/MultiSelectFilter.tsx`:

```tsx
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
```

- [ ] **Step 2: Type-check and lint**

Run: `cd shiurim-app && npm run lint`
Expected: no errors reported for the new file.

- [ ] **Step 3: Commit**

```bash
git add shiurim-app/components/lectures/MultiSelectFilter.tsx
git commit -m "feat(homepage): add generic MultiSelectFilter dropdown component"
```

---

### Task 2: Wire rabbi + folder filters into `RecentlyGiven`

**Files:**
- Modify: `shiurim-app/components/lectures/RecentlyGiven.tsx`

**Interfaces:**
- Consumes: `MultiSelectFilter` from Task 1 (`import MultiSelectFilter from './MultiSelectFilter'`), `normalizeRabbi` from `@/lib/rabbi-normalization`.
- Produces: `RecentlyGiven` now requires a new prop `folderOrder: string[]` (canonical top-level category labels, in display order) in addition to the existing `lectures: FlatLecture[]` and `userId?: string | null`. Task 3 supplies this prop from `app/page.tsx`.

- [ ] **Step 1: Replace the component body**

Replace the full contents of `shiurim-app/components/lectures/RecentlyGiven.tsx` with:

```tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { FlatLecture } from '@/lib/lecture-utils'
import { normalizeRabbi } from '@/lib/rabbi-normalization'
import { createClient } from '@/lib/supabase-browser'
import LectureCard from './LectureCard'
import MultiSelectFilter from './MultiSelectFilter'

const PAGE_SIZE = 15

type OverrideMap = Record<string, string>

/** Homepage "Recently Given" list — the newest shiurim by delivery date.
 *  Reuses LectureCard so each shiur is its own card with the full (wrapping)
 *  title, matching the list view on the navigation pages. The caller passes a
 *  pre-sorted, deduped pool of lectures (newest first, up to 200); this
 *  component reveals them 15 at a time via "View More", fetches speaker
 *  overrides for the whole pool so tiles show the same corrected rabbi names
 *  as the subfolder lecture lists, and lets the visitor narrow the pool by
 *  rabbi and/or top-level folder (local state only — filtering always runs
 *  against the full pool, so changing a filter immediately reveals up to
 *  PAGE_SIZE matches rather than shrinking the current page). */
export default function RecentlyGiven({
  lectures,
  userId,
  folderOrder,
}: {
  lectures: FlatLecture[]
  userId?: string | null
  folderOrder: string[]
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [overrideMap, setOverrideMap] = useState<OverrideMap>({})
  const [selectedRabbis, setSelectedRabbis] = useState<string[]>([])
  const [selectedFolders, setSelectedFolders] = useState<string[]>([])

  useEffect(() => {
    const supabase = createClient()
    const ids = lectures.map(l => l.id)
    if (ids.length === 0) return

    supabase
      .from('speaker_overrides')
      .select('lecture_id, speaker')
      .in('lecture_id', ids)
      .then(({ data }) => {
        if (data) {
          setOverrideMap(
            Object.fromEntries(data.map((o: { lecture_id: string; speaker: string }) => [o.lecture_id, o.speaker]))
          )
        }
      })
  }, [lectures])

  const effectiveSpeaker = (l: FlatLecture) => overrideMap[l.id] ?? normalizeRabbi(l.speaker)

  const rabbiOptions = useMemo(
    () => Array.from(new Set(lectures.map(effectiveSpeaker).filter(Boolean))).sort(),
    [lectures, overrideMap]
  )

  const folderOptions = useMemo(() => {
    const present = new Set(lectures.map(l => l.breadcrumb[0]).filter(Boolean))
    return folderOrder.filter(f => present.has(f))
  }, [lectures, folderOrder])

  const filteredLectures = useMemo(() => {
    return lectures.filter(l => {
      const rabbiOk = selectedRabbis.length === 0 || selectedRabbis.includes(effectiveSpeaker(l))
      const folderOk = selectedFolders.length === 0 || selectedFolders.includes(l.breadcrumb[0])
      return rabbiOk && folderOk
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lectures, overrideMap, selectedRabbis, selectedFolders])

  function handleRabbiChange(next: string[]) {
    setSelectedRabbis(next)
    setVisibleCount(PAGE_SIZE)
  }

  function handleFolderChange(next: string[]) {
    setSelectedFolders(next)
    setVisibleCount(PAGE_SIZE)
  }

  if (lectures.length === 0) return null

  const visibleLectures = filteredLectures.slice(0, visibleCount)
  const hasMore = visibleCount < filteredLectures.length

  return (
    <section>
      <h2 className="text-lg font-semibold text-stone-700 mb-4">Recently Given</h2>

      <div className="flex items-center gap-2 mb-4">
        <MultiSelectFilter
          emptyLabel="Rabbi"
          pluralNoun="rabbis"
          allLabel="All rabbis"
          options={rabbiOptions}
          selected={selectedRabbis}
          onChange={handleRabbiChange}
        />
        <MultiSelectFilter
          emptyLabel="Folder"
          pluralNoun="folders"
          allLabel="All folders"
          options={folderOptions}
          selected={selectedFolders}
          onChange={handleFolderChange}
        />
      </div>

      {filteredLectures.length === 0 ? (
        <p className="text-sm text-stone-400 py-4">No recent shiurim match these filters.</p>
      ) : (
        <div className="space-y-2">
          {visibleLectures.map((lec, i) => (
            <LectureCard
              key={lec.id}
              lecture={lec}
              index={i + 1}
              speakerOverride={overrideMap[lec.id]}
              userId={userId}
            />
          ))}
        </div>
      )}

      <div className="flex items-center gap-4 mt-4">
        {hasMore && (
          <button
            onClick={() => setVisibleCount(c => Math.min(c + PAGE_SIZE, filteredLectures.length))}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
          >
            View More
          </button>
        )}
        <Link
          href="/lectures"
          className="text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors"
        >
          Browse all shiurim →
        </Link>
      </div>
    </section>
  )
}
```

Note: `effectiveSpeaker` is intentionally omitted from the `filteredLectures` memo's dependency array (its only free variable, `overrideMap`, is already listed directly) — this matches the `eslint-disable-next-line` comment included above.

- [ ] **Step 2: Type-check and lint**

Run: `cd shiurim-app && npm run lint`
Expected: no errors. (This step will also surface the missing `folderOrder` prop at the `<RecentlyGiven ... />` call site in `app/page.tsx` as a type error — expected until Task 3.)

- [ ] **Step 3: Commit**

```bash
git add shiurim-app/components/lectures/RecentlyGiven.tsx
git commit -m "feat(homepage): filter Recently Given by rabbi and top-level folder"
```

---

### Task 3: Supply `folderOrder` from the homepage and verify end-to-end

**Files:**
- Modify: `shiurim-app/app/page.tsx:89`

**Interfaces:**
- Consumes: `RecentlyGiven`'s `folderOrder: string[]` prop from Task 2; `categories` (already imported at `app/page.tsx:1` from `@/lib/lectures`).
- Produces: nothing consumed by later tasks — this is the last task.

- [ ] **Step 1: Pass folder order into `RecentlyGiven`**

In `shiurim-app/app/page.tsx`, change line 89 from:

```tsx
      <RecentlyGiven lectures={recentlyGiven} userId={user?.id ?? null} />
```

to:

```tsx
      <RecentlyGiven
        lectures={recentlyGiven}
        userId={user?.id ?? null}
        folderOrder={categories.map(c => c.label)}
      />
```

- [ ] **Step 2: Type-check and lint**

Run: `cd shiurim-app && npm run lint`
Expected: no errors (the Task 2 type error about a missing `folderOrder` prop is now resolved).

- [ ] **Step 3: Manual verification in the browser**

Run: `cd shiurim-app && npm run dev`, then open `http://localhost:3000/`.

Verify, in order:
1. The "Recently Given" section shows a "Rabbi" pill and a "Folder" pill side by side, above the lecture list.
2. Click "Rabbi", select one rabbi. The list narrows to that rabbi's recent shiurim, up to 15 shown immediately (not fewer than the previous visible count would suggest), and the pill now shows that rabbi's name.
3. Click "Folder", select one folder (e.g. "Chumash"). The list further narrows to that rabbi + folder combination (AND logic).
4. Click "View More" — confirm it reveals more matches from the filtered set, not from the unfiltered pool.
5. Clear both filters (via each dropdown's "All ..." row) — confirm the full unfiltered recent list returns and pagination resets to 15.
6. Select a rabbi/folder combination unlikely to overlap (or, if none exists in current data, temporarily pick two real filters that combine to zero results) — confirm the "No recent shiurim match these filters." message renders in place of the grid.
7. Confirm no console errors appear in DevTools during any of the above.

Expected: all seven checks pass.

- [ ] **Step 4: Commit**

```bash
git add shiurim-app/app/page.tsx
git commit -m "feat(homepage): supply top-level folder order to Recently Given filters"
```
