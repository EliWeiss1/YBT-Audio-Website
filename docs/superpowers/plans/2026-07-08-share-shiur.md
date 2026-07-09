# Share a Shiur — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a compact "Share" icon button to the individual shiur page that shares the page URL via the native OS share sheet (mobile) or copies it to the clipboard (desktop fallback).

**Architecture:** A single new client component, `ShareButton`, wired into the existing meta/action row on the shiur detail page. It has no server dependency and no props beyond the lecture title — the URL to share is read from `window.location.href` at click time.

**Tech Stack:** Next.js (App Router) + React + Tailwind CSS. No new dependencies — uses the browser's native `navigator.share` / `navigator.clipboard` APIs. No icon library (hand-written inline SVG, matching the rest of the codebase).

## Global Constraints

- No new npm dependencies (spec: uses native browser APIs only).
- No icon library — inline `<svg>` matching the stroke style of `BookmarkButton.tsx`'s icons (`fill="none" stroke="currentColor" strokeWidth={2}`).
- Styling must exactly match `BookmarkButton`'s icon-only idle state: `rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors`, `p-1.5` padding, `w-5 h-5` icon.
- No error toasts or visible error states — failures (share cancelled, clipboard write denied) fail silently, matching `BookmarkButton`'s low-ceremony error handling.
- No dedicated share dialog, no social-platform-specific icons, no URL shortening, no analytics — out of scope per spec.

## Testing approach (deviation from default TDD)

This codebase's only automated tests are `vitest` unit tests against pure logic in `lib/**/__tests__/*.test.ts` (environment: `node`, no `jsdom`, no `@testing-library/react` installed — see `vitest.config.ts`). There are zero React component tests anywhere in the repo. `ShareButton` has no pure logic worth extracting — it's a thin wrapper around two browser APIs (`navigator.share`, `navigator.clipboard`) and one `useState` toggle. Standing up a jsdom + React Testing Library harness for this one component would be new test infrastructure, out of scope for this feature (YAGNI).

Instead, this plan verifies the component by running the dev server and exercising it in a real browser (Task 2, Step 4) — consistent with how the codebase currently verifies UI components.

---

### Task 1: Create the ShareButton component

**Files:**
- Create: `shiurim-app/components/lectures/ShareButton.tsx`

**Interfaces:**
- Produces: `export default function ShareButton({ title }: { title: string })` — a React client component with no other exports.

- [ ] **Step 1: Create the component file**

```tsx
'use client'

import { useState } from 'react'

type Props = {
  title: string
}

const ShareIcon = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M12 16V4m0 0L8 8m4-4l4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </svg>
)

const CheckIcon = ({ cls }: { cls: string }) => (
  <svg className={cls} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
  </svg>
)

export default function ShareButton({ title }: Props) {
  const [copied, setCopied] = useState(false)

  const handleShare = async () => {
    const url = window.location.href

    if (navigator.share) {
      try {
        await navigator.share({ title, url })
      } catch (err) {
        // AbortError = user cancelled the share sheet — not an error.
        // Any other failure is also not actionable here, so it's swallowed too.
      }
      return
    }

    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard write denied/unsupported — no confirmation shown, no error surfaced.
    }
  }

  return (
    <button
      onClick={handleShare}
      title="Share"
      className="rounded-lg p-1.5 text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors"
    >
      {copied ? <CheckIcon cls="w-5 h-5" /> : <ShareIcon cls="w-5 h-5" />}
    </button>
  )
}
```

- [ ] **Step 2: Type-check the new file**

Run: `cd shiurim-app && npx tsc --noEmit`
Expected: no errors referencing `ShareButton.tsx`.

- [ ] **Step 3: Commit**

```bash
git add shiurim-app/components/lectures/ShareButton.tsx
git commit -m "feat(lectures): add ShareButton component"
```

---

### Task 2: Wire ShareButton into the shiur detail page and verify

**Files:**
- Modify: `shiurim-app/app/lectures/[id]/page.tsx:1-9` (imports), `shiurim-app/app/lectures/[id]/page.tsx:114-116` (action row)

**Interfaces:**
- Consumes: `ShareButton` from Task 1 — `export default function ShareButton({ title }: { title: string })`.

- [ ] **Step 1: Add the import**

In `shiurim-app/app/lectures/[id]/page.tsx`, add alongside the existing component imports (after the `BookmarkButton` import on line 7):

```tsx
import ShareButton from '@/components/lectures/ShareButton'
```

- [ ] **Step 2: Render it in the action row**

In `shiurim-app/app/lectures/[id]/page.tsx`, replace lines 114-116:

```tsx
        {/* Save for later — self-fetches auth + saved state client-side */}
        <BookmarkButton lectureId={lecture.id} size="md" />
      </div>
```

with:

```tsx
        {/* Save for later — self-fetches auth + saved state client-side */}
        <BookmarkButton lectureId={lecture.id} size="md" />
        {/* Share — native share sheet on mobile, clipboard copy fallback on desktop */}
        <ShareButton title={lecture.title} />
      </div>
```

- [ ] **Step 3: Type-check**

Run: `cd shiurim-app && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Manual verification in the browser**

Run: `cd shiurim-app && npm run dev`

Then in a browser at `http://localhost:3000`:
1. Navigate to any individual shiur page (e.g. click into any lecture from `/lectures`).
2. Confirm the Share icon (square with an upward arrow) appears in the action row immediately after the bookmark icon, doesn't wrap awkwardly, and matches the visual weight/color of the bookmark icon in its idle (unsaved) state.
3. Click it. Since desktop Chrome/Firefox/Edge don't implement `navigator.share` by default, this should copy the URL to the clipboard — confirm the icon swaps to a checkmark for ~2 seconds, then reverts to the share icon.
4. Paste the clipboard contents somewhere (e.g. the address bar of a new tab) and confirm it matches the current page's URL exactly.
5. Resize the browser to a narrow mobile width and confirm the action row still wraps cleanly (`flex-wrap` already handles this) and the share button doesn't overlap or crowd adjacent elements.
6. If testing on an actual mobile device or a browser that implements `navigator.share` (e.g. real Android Chrome, iOS Safari): click the button and confirm the native OS share sheet opens with the shiur title and URL pre-filled, and that cancelling the sheet leaves the icon unchanged (no error, no checkmark).

Expected: all checks pass with no console errors.

- [ ] **Step 5: Commit**

```bash
git add shiurim-app/app/lectures/[id]/page.tsx
git commit -m "feat(lectures): wire ShareButton into shiur detail page"
```

---

## Self-Review Notes

- **Spec coverage:** Native share + clipboard fallback (Task 1 Step 1), icon-only placement after BookmarkButton (Task 2 Step 2), checkmark confirmation on copy (Task 1 Step 1), matching BookmarkButton styling (Task 1 Step 1 className), silent error handling for AbortError and clipboard failures (Task 1 Step 1) — all covered.
- **Placeholder scan:** No TBD/TODO markers; manual verification steps list concrete checks rather than "test it works."
- **Type consistency:** `ShareButton({ title }: { title: string })` defined in Task 1 matches the `<ShareButton title={lecture.title} />` usage in Task 2 — `lecture.title` is a `string` per the existing `SpeakerEditor`/`h1` usage earlier in the same file.
