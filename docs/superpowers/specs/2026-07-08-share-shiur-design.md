# Share a Shiur — Design Spec

## Purpose

Let a user share a link to an individual shiur page with someone else, directly from that page, without cluttering the existing layout.

## Location

New action button added to the existing meta/action row on the individual shiur page:
`shiurim-app/app/lectures/[id]/page.tsx`, appended after `BookmarkButton` (line 115).

## Component

New file: `shiurim-app/components/lectures/ShareButton.tsx`

- `'use client'` component (needs `navigator.share` / `navigator.clipboard`, both browser-only APIs).
- Props: `{ lectureId: string; title: string }`. The lecture ID is accepted for consistency with sibling components (`BookmarkButton`, `DownloadButton`) even though the current implementation doesn't need it directly — the share URL is derived from `window.location.href`, not constructed from the ID.
- No external icon library (none is used anywhere in this codebase) — a hand-written inline `<svg>` share glyph (square with an upward-pointing arrow, stroke `currentColor`), matching the pattern used by `BookmarkOutline`/`BookmarkFilled` in `BookmarkButton.tsx`.

## Behavior

On click:
1. Build the URL to share: `window.location.href`.
2. If `navigator.share` exists (mobile Safari/Chrome, some desktop browsers), call:
   ```js
   navigator.share({ title, url })
   ```
   This opens the native OS share sheet. If the user cancels, `navigator.share` rejects with `AbortError` — caught and ignored silently (not a real error).
3. Otherwise (`navigator.share` undefined — most desktop browsers), fall back to:
   ```js
   navigator.clipboard.writeText(url)
   ```
   and show a brief local "copied" confirmation.

## Feedback

- **Native share path**: no in-app confirmation needed — the OS share sheet itself is the user-visible feedback.
- **Clipboard fallback path**: on successful copy, the share icon swaps to a checkmark icon for ~2 seconds (via `setTimeout`), then reverts to the share icon. No text label, no tooltip — stays visually consistent with the icon-only, compact style of the row.

## Styling

Matches `BookmarkButton`'s icon-only idle state exactly, for visual consistency in the shared action row:

```
rounded-lg text-stone-400 hover:text-stone-600 hover:bg-stone-100 transition-colors
```

- Padding: `p-1.5` (matches `size="md"` used by the adjacent `BookmarkButton` in this row).
- Icon size: `w-5 h-5`.
- `title="Share"` attribute for accessibility/tooltip, consistent with existing buttons in the row (e.g. `title="Download MP3"`).

## Error handling

- `navigator.share` `AbortError` (user cancelled): swallowed, no UI change.
- `navigator.clipboard.writeText` failure (rare — e.g. permissions): swallowed; button simply doesn't show the checkmark confirmation. No error toast — matches the low-ceremony error handling of `BookmarkButton`'s optimistic-update revert.

## Out of scope

- No dedicated share dialog / modal with per-platform icons (Twitter, Facebook, etc.) — native share sheet or plain link copy covers this.
- No server-side URL shortening — the canonical `/lectures/[id]` URL is shared as-is.
- No analytics/tracking of share events.
