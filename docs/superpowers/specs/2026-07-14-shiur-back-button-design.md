# Back button on shiur detail page

## Problem

The shiur detail page (`app/lectures/[id]/page.tsx`) has no way to return to whatever page the user came from (a filtered category listing, search results, a speaker page, etc.). The only navigation-back affordance today is the breadcrumb, which links to fixed destinations (`/lectures` or `/lectures?node={nodeId}`) rather than the actual previous page/scroll state.

## Design

**Component**: New client component `components/lectures/BackButton.tsx` (`'use client'`), imported into the existing server component `app/lectures/[id]/page.tsx`. This matches the existing pattern of extracting client islands (`BookmarkButton`, `ShareButton`, `DownloadButton`) out of the server-rendered page.

**Behavior**: Uses `router.back()` (via `useRouter` from `next/navigation`) so the user returns to their actual previous page — preserving filters, search query, and scroll position. Since `router.back()` silently no-ops if there's no history entry to return to (e.g. the page was opened from a shared link, a new tab, or as the first page in the session), the component checks on mount whether there's usable in-app history (e.g. `document.referrer` is same-origin, or `window.history.state?.idx > 0`) and falls back to rendering a plain `<Link href="/lectures">` in that case, so the button is never a dead click.

**Placement & styling**: Renders as its own line above the existing breadcrumb `<nav>`, top-left of the page's content container (`px-4 py-6 sm:p-8 max-w-3xl mx-auto`). A left-chevron inline SVG (hand-written, matching the icon convention already used in `LayoutShell.tsx` — no icon library is installed) followed by the text "Back". Styled `text-sm text-stone-500 hover:text-stone-700 transition-colors`, with enough padding to give a `min-h-[44px]` tap target for comfortable mobile use on both iOS and Android. Not sticky/fixed — it scrolls with the page like the breadcrumb beneath it. No safe-area-inset padding needed since it sits below the already-safe-top global header in `LayoutShell.tsx`.

**Out of scope**: No changes to the breadcrumb itself, no new icon library, no sticky/fixed positioning, no new automated tests (no existing page/component test convention in this repo — verified manually instead via `npm run build && npm start` at mobile and desktop widths).

## Testing / verification

Manual: build and run the app, click into a shiur from (a) a filtered category listing, (b) search results, (c) directly via URL with no referrer, and confirm the back button returns to the right place (or falls back to `/lectures` in case (c)) at both mobile and desktop widths.
