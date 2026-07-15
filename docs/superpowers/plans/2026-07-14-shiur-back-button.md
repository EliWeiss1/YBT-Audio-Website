# Shiur Back Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a top-left "Back" button to the shiur detail page that returns the user to whatever page they came from, with a safe fallback when there's no in-app history to return to.

**Architecture:** A single new client component, `BackButton`, is dropped into the existing server-rendered shiur page (`app/lectures/[id]/page.tsx`) above the breadcrumb, following the same client-island pattern already used there for `BookmarkButton`/`ShareButton`/`DownloadButton`. It calls `router.back()` when there's a prior history entry in the current tab, and falls back to a plain link to `/lectures` when there isn't.

**Tech Stack:** Next.js App Router, React client component, Tailwind CSS, `next/navigation` (`useRouter`), hand-written inline SVG (no icon library is installed in this repo).

## Global Constraints

- No icon library is installed — icons are hand-written inline `<svg>` elements, matching the existing pattern in `components/lectures/ShareButton.tsx` and `components/layout/LayoutShell.tsx`.
- No automated component/page test convention exists in this repo (spec explicitly scopes this to manual verification instead of new test files).
- Tap targets must be at least 44px tall for mobile (iOS/Android) usability.
- Must not use `sticky`/`fixed` positioning — the button scrolls with the page like the breadcrumb below it.
- Must not need `safe-area-inset` padding — it renders below the already-safe-top global header in `components/layout/LayoutShell.tsx`.

---

### Task 1: Create the `BackButton` client component

**Files:**
- Create: `shiurim-app/components/lectures/BackButton.tsx`

**Interfaces:**
- Consumes: nothing (no props) — reads `window.history.length` and uses `next/navigation`'s `useRouter`.
- Produces: `export default function BackButton()` — a zero-prop React component, importable as `import BackButton from '@/components/lectures/BackButton'`. Renders a clickable "← Back" affordance that either calls `router.back()` or renders a `<Link href="/lectures">`, both styled identically so there's no visible difference between the two states.

- [ ] **Step 1: Write the component**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const BackIcon = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
  </svg>
)

// Shared classes so the router.back() button and the <Link> fallback render identically.
const backLinkClasses =
  'inline-flex items-center gap-1.5 -ml-1.5 pl-1.5 pr-3 py-2 min-h-[44px] rounded-lg ' +
  'text-sm text-stone-500 hover:text-stone-700 hover:bg-stone-100 transition-colors'

export default function BackButton() {
  const router = useRouter()
  // Defaults false during SSR/first paint (no `window`), then flips true on mount
  // if this tab has a prior entry to go back to. A same-tab click from an internal
  // link, or an external referrer, both count as "has history" — only a fresh tab
  // (shared link, PWA launch, bookmark) has history.length === 1.
  const [hasHistory, setHasHistory] = useState(false)

  useEffect(() => {
    setHasHistory(window.history.length > 1)
  }, [])

  if (hasHistory) {
    return (
      <button onClick={() => router.back()} className={backLinkClasses}>
        <BackIcon cls="w-4 h-4" />
        Back
      </button>
    )
  }

  return (
    <Link href="/lectures" className={backLinkClasses}>
      <BackIcon cls="w-4 h-4" />
      Back
    </Link>
  )
}
```

- [ ] **Step 2: Typecheck and lint the new file**

Run: `cd shiurim-app && npx tsc --noEmit`
Expected: no errors reported for `components/lectures/BackButton.tsx`

Run: `cd shiurim-app && npm run lint`
Expected: no new lint errors/warnings for `components/lectures/BackButton.tsx`

- [ ] **Step 3: Commit**

```bash
git add shiurim-app/components/lectures/BackButton.tsx
git commit -m "feat(lectures): add BackButton component"
```

---

### Task 2: Wire `BackButton` into the shiur detail page

**Files:**
- Modify: `shiurim-app/app/lectures/[id]/page.tsx:1-11` (imports), `:44-67` (top of returned JSX, above the breadcrumb `<nav>`)

**Interfaces:**
- Consumes: `BackButton` from Task 1 (`import BackButton from '@/components/lectures/BackButton'`), zero props.
- Produces: nothing new — this is the integration point, no other task depends on it.

- [ ] **Step 1: Add the import**

In `shiurim-app/app/lectures/[id]/page.tsx`, add the import alongside the other `components/lectures/*` imports (after line 10, the `DownloadButton` import):

```tsx
import DownloadButton from '@/components/lectures/DownloadButton'
import BackButton from '@/components/lectures/BackButton'
```

- [ ] **Step 2: Render it above the breadcrumb**

Replace:

```tsx
    <div className="px-4 py-6 sm:p-8 max-w-3xl mx-auto">

      {/* Breadcrumb */}
      <nav className="text-sm text-stone-400 mb-6 flex items-center gap-1.5 flex-wrap">
```

with:

```tsx
    <div className="px-4 py-6 sm:p-8 max-w-3xl mx-auto">

      {/* Back */}
      <div className="mb-2">
        <BackButton />
      </div>

      {/* Breadcrumb */}
      <nav className="text-sm text-stone-400 mb-6 flex items-center gap-1.5 flex-wrap">
```

- [ ] **Step 3: Typecheck and build**

Run: `cd shiurim-app && npx tsc --noEmit`
Expected: no errors

Run: `cd shiurim-app && npm run build`
Expected: build succeeds (this also regenerates `public/lectures-data/` via the `prebuild`-style step already wired into `npm run build` — no separate action needed)

- [ ] **Step 4: Manual verification**

Run: `cd shiurim-app && npm start` (after the build in Step 3), then in a browser:

1. From `/lectures`, filter/search to a specific category, click into a shiur → confirm "← Back" appears top-left above the breadcrumb, and clicking it returns to `/lectures` with the same filter/search state and scroll position intact.
2. Open a shiur's URL directly in a fresh tab (paste the URL, no prior navigation) → confirm "← Back" still renders (as the `/lectures` fallback link) and clicking it lands on `/lectures`.
3. Resize the browser to a mobile width (e.g. 375px) via DevTools device toolbar, and separately check on an actual iPhone/Android browser if available → confirm the button has a comfortable tap target, doesn't wrap awkwardly against the breadcrumb, and sits cleanly below the app header (no overlap, no extra gap from unnecessary safe-area padding).
4. Check desktop width (e.g. 1280px) → confirm the button sits top-left of the `max-w-3xl` content column, not the full viewport edge.

- [ ] **Step 5: Commit**

```bash
git add shiurim-app/app/lectures/\[id\]/page.tsx
git commit -m "feat(lectures): show back button on shiur detail page"
```

---

## Self-Review Notes

- **Spec coverage:** router.back()-with-fallback behavior (Task 1), top-left placement above breadcrumb (Task 2), icon+text style matching hand-rolled SVG convention (Task 1), 44px tap target / no sticky / no safe-area (Global Constraints + Task 1 classes), manual cross-device verification in place of automated tests (Task 2 Step 4) — all covered.
- **Placeholders:** none — every step has literal code/commands.
- **Type consistency:** `BackButton` is a zero-prop default export in both Task 1 (produces) and Task 2 (consumes/import) — matches.
