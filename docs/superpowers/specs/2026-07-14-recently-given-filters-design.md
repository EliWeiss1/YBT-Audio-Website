# Recently Given: Rabbi + Folder Filters

## Problem

The homepage "Recently Given" section (`components/lectures/RecentlyGiven.tsx`) shows the 200 most recent lectures (by date), paginated 15 at a time via "View More". There's no way to narrow this down to a specific rabbi or a specific top-level category (Chumash, Discussion, Halacha, etc.), so finding recent shiurim from one rabbi or one subject area means manually paging through everything.

## Goals

- Add a rabbi filter and a top-level-folder filter to the Recently Given section.
- Both multi-select, combinable (AND logic between the two filter types).
- Changing a filter immediately shows up to 15 matching results (not fewer, even if fewer than 15 were visible pre-filter) — filtering always operates against the full loaded pool, not the currently-visible slice.
- No server/data-pipeline changes; everything operates on data already passed to the component.

## Non-goals

- URL/query-param-driven filters (this is local UI state, resets on navigation/reload — consistent with the section's existing "View More" behavior, which is also local state).
- Expanding the 200-lecture pool sliced in `app/page.tsx`. Filters apply only within that pool; a sparse filter combination may show few or zero results, which is acceptable for a "recent activity" section.
- Deep/sub-node folder filtering — folder filter is top-level categories only (`breadcrumb[0]`), matching the app's existing top-level nav categories.

## Data

No new data sources. `RecentlyGiven` already receives `lectures: FlatLecture[]` as a prop (see `lib/lecture-utils.ts`), where each item has:
- `speaker: string` (raw/free-text; normalize via `normalizeRabbi()` from `lib/rabbi-normalization.ts`, corrected further by the `speaker_overrides` map already fetched in this component)
- `breadcrumb: string[]` — `breadcrumb[0]` is the top-level category label (e.g. "Chumash", "Discussion", "Halacha")

**Rabbi filter options**: unique `normalizeRabbi(speaker)` values (post-override) across the 200 loaded lectures, sorted alphabetically. Same dedup approach as `RabbiFilter` in `app/lectures/LecturesClient.tsx`.

**Folder filter options**: unique `breadcrumb[0]` values present in the 200 loaded lectures, ordered to match the canonical top-level `categories` array order from `lib/lectures.ts` (Bnai Noach, Chumash, Discussion, Halacha, Holidays, Kisvei Chazal, Kisvei Rishonim, Misc, Nach, Rav Aaron Soloveitchik, Rav Y.D. Soloveitchik, Gemarah, Mishna) rather than alphabetically, so it matches nav order elsewhere in the app.

## UI

Two pill-style dropdown buttons placed in a row just under the "Recently Given" heading, visually matching the existing `RabbiFilter` component in `app/lectures/LecturesClient.tsx` (rounded-pill button, checkbox-style option list, "All" / "Clear all" options, click-outside-to-close). One dropdown for rabbi, one for folder.

## Behavior

- Both filters are multi-select `useState<string[]>` (or `Set<string>`) local to `RecentlyGiven`, combined with AND logic: a lecture passes if (no rabbi filter selected OR its normalized speaker is in the selected rabbis) AND (no folder filter selected OR its `breadcrumb[0]` is in the selected folders).
- `filteredLectures` is derived from the full 200-lecture prop on every render (via `useMemo`, keyed on `lectures`, selected rabbis, selected folders).
- The existing "View More" pagination (`visibleCount` state, currently starts at 15 and grows by 15) slices from `filteredLectures`, not the raw prop.
- Whenever either filter selection changes, `visibleCount` resets to 15, so the initial view after filtering always shows up to 15 matches (not merely the matching subset of whatever was already visible).
- If `filteredLectures` is empty, render a small "No recent shiurim match these filters" message in place of the lecture grid.
- If a filter's option list would only have one option, or if a lecture's derived rabbi/folder value is empty, exclude those from filter option lists (no degenerate single/blank options).

## Testing

- Manual verification in-browser (per CLAUDE.md `npm run dev`): select a rabbi, confirm the grid narrows to their recent shiurim and count is right; select a folder, confirm same; combine both; clear filters and confirm the full recent list returns; verify "View More" continues to work correctly against a filtered list; verify the empty-state message appears for an over-constrained combination.
- No new automated test coverage planned — this repo's Vitest coverage is scoped to the ingest/zoom pipeline (per CLAUDE.md), and `RecentlyGiven` has no existing test file to extend a pattern from.
