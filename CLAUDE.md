# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo layout

This repo's only real content is the Next.js app in `shiurim-app/` — run all commands from that directory. The repo root just holds `.github/workflows/` (CI/cron jobs that `cd shiurim-app` before running anything) and misc top-level files.

## Commands (run inside `shiurim-app/`)

```bash
npm install
npm run dev              # regenerates public/lectures-data/ from data/lectures.json, then next dev
npm run build            # same regen step, then production build (what Vercel runs)
npm run generate-node-data  # just the data-splitting step, standalone
npm run lint
npm test                 # vitest run (all tests, one-shot)
npm run test:watch       # vitest watch mode
npx vitest run path/to/file.test.ts   # single test file
```

Required env vars for local dev live in `.env.local` (see `.env.local.example` for the minimal Supabase pair; ingest/migration features need many more — `INGEST_SECRET`, `GITHUB_REPO`, `GITHUB_DISPATCH_TOKEN`, `GITHUB_ISSUES_TOKEN`, `R2_ACCOUNT_ID`/`R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`/`R2_BUCKET_NAME`/`R2_PUBLIC_URL`, `ANTHROPIC_API_KEY`, `RESEND_API_KEY`, `ADMIN_EMAIL`, `ADMIN_USER_ID`, `ZOOM_CLIENT_ID`/`ZOOM_CLIENT_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `STATS_API_KEY`, `VERCEL_DEPLOY_HOOK_URL`, `NEXT_PUBLIC_APP_URL`). Setting `INGEST_DRY_RUN=true` short-circuits every write/upload/notify/dispatch step in the ingest pipeline for safe local testing.

The service worker is disabled in `next dev`. To test PWA behavior (install prompt, offline, downloads): `npm run build && npm start`, then use Chrome DevTools → Application. Full verification is easiest against the deployed HTTPS site.

## Architecture

### Lecture data pipeline

`data/lectures.json` (~9.4 MB, ~19k lectures) is the single source of truth, committed to git. At build/dev time `scripts/generate-node-data.mjs` splits it into static files under `public/lectures-data/` (per-node chunks, `index.json`, `catalog.json`, `tree.json`, `speakers.json`), served from Vercel's CDN.

- Server code reads the JSON directly via `lib/lectures.ts` (server-only, 9.4 MB — never import from a client component).
- Client components use `lib/lecture-utils.ts` (pure types/helpers) + `lib/client-catalog.ts` (lazily fetches `catalog.json`, not bundled into JS).
- `generate-node-data.mjs::mergePendingLectures` also folds in any Supabase `pending_lectures` rows (written by the live ingest pipeline below) at generation time.

### Three separate ingest mechanisms — don't mix them up

1. **Live email/Zoom ingest** (`lib/ingest/*`, `app/api/ingest-shiur`, `app/api/ingest-complete`): a rebbe emails a Zoom recording link, a Cloudflare Email Worker (`cloudflare-worker/email-worker.js`) forwards the raw MIME to `/api/ingest-shiur`, which parses → resolves the Zoom URL → uploads to R2 → categorizes (rule-based, `ANTHROPIC_API_KEY` only for ambiguous cases) → writes a `pending_lectures` Supabase row → triggers a Vercel deploy. Limitation: writes only `[categoryId, nodeId]` (can't target deep nodes, no cross-listing).
   - Zoom cloud recordings are passcode-protected and can only be fetched by driving a real browser session, which doesn't fit in a Vercel serverless function. `/api/ingest-shiur` instead fires a `repository_dispatch` (`lib/ingest/github-dispatch.ts`) to the `zoom-ingest` GitHub Actions workflow (`.github/workflows/zoom-ingest.yml`), which runs `scripts/zoom-browser-ingest.mjs` (Playwright) and calls back into `/api/ingest-complete` when done. A rebbe can add a `merge`/`separate`/`only N` keyword line in the email body to control multi-clip Zoom shares (`lib/ingest/types.ts::RecordingPlan`).
2. **Bulk scraper directly into `data/lectures.json`** (pattern in `scripts/yutorah-scraper.js`, used for the Schneeweiss YUTorah migration — see `docs/schneeweiss-migration.md`): supports arbitrary node depth and cross-listing a shiur into multiple category nodes (insert the identical lecture object, same `id`, into each target node's `lectures[]` — safe because both the per-node splitter and the catalog dedupe by id). Runs on a weekly cron (`.github/workflows/schneeweiss-weekly-sync.yml`) via `scripts/migrate-schneeweiss.js`, checkpointed so re-runs only pick up new shiurim.
3. **Google Drive daily sync** (`scripts/drive-sync.mjs`, `.github/workflows/drive-ingest.yml`): rabbis' Zoom recordings auto-save to shared Drive folders named `YYYY-MM-DD_<Rabbi>_<Title>.m4a`. A daily job lists the roots in `data/drive-folders.json` (recursively, via a Google service account), skips files already recorded `status='done'` in the Supabase `drive_ingest_log` table, then for each new file: parses the filename (`scripts/lib/drive-filename.mjs`), transcodes m4a→mp3 (ffmpeg), uploads to R2, and POSTs to the **same** `/api/ingest-complete` as the Zoom pipeline (with `source:'drive'`, `suppressNotify:true`). Fires one Vercel deploy + one Resend summary per run. Speaker/title come from the filename (folder name resolves the speaker; `data/drive-speaker-map.json` overrides). The same script run locally does the initial backfill (`--max N` to batch, `--dry-run` to validate parsing only).
   - **Categorization differs from the Zoom path.** Each root folder can declare a `category` pin in `data/drive-folders.json` (`lib/ingest/drive-categorizer.ts`): a *specific* node (e.g. `kisvei-rishonim-rambam-perek-chelek`) → every shiur goes straight there; a *top-level* category (e.g. `gemarah`) → sub-categorize by title (keyword label match → constrained Haiku → else a per-rabbi fallback folder auto-created under the category, e.g. "Rabbi Bald" under Gemarah); no pin (mixed roots) → the normal whole-tree `categorize()` + `/admin/flags`. To support the deep pins + created nodes, `generate-node-data.mjs::mergePendingLectures` (via `scripts/lib/merge-pending.mjs`) walks a `node_path` of any depth and creates the final node when the row carries a `node_label` — so unlike mechanism 1, Drive **can** target deep nodes (still single-placement, no cross-listing).

### Public API (`/api/v1/*`)

Read-only, unauthenticated, documented in full in `API_CONTRACT.md`: `GET /api/v1/lectures` (filter/search/paginate), `GET /api/v1/lectures/:id`, `GET /api/v1/categories`. `/api/v1/stats` is the one authenticated exception (`STATS_API_KEY`).

### Service worker (`public/sw.js`)

Hand-written, no bundler plugin (survives Next.js changes): network-first for pages with an `/offline` fallback, precaches `/`, `/offline`, `/downloads` on install (refreshed ≤ once/24h), cache-first for `/_next/static/`, stale-while-revalidate for `/lectures-data/`/images, and Range-aware caching for `/api/download/:id` (written only by `lib/downloads.ts`, read by the player for offline playback). Registered by `components/pwa/ServiceWorkerRegister.tsx`, production only.

### Offline downloads

`lib/downloads.ts` proxies audio through same-origin `/api/download/[id]` (upstream hosts lack CORS), stores bytes in Cache Storage, keeps metadata in localStorage. `lib/player-context.tsx` prefers the cached copy when present. iOS caveat: the installed home-screen app and the Safari tab have separate storage.

### Suggestion box

`/feedback` is a public, anonymous form (Bug/Feature toggle + description, no login) that posts to `/api/feedback`. The route writes a row to the `suggestions` table (service-role client) and files a matching GitHub Issue (`labels: [bug|enhancement, suggestion-box]`) via raw `fetch` to the GitHub REST API using `GITHUB_ISSUES_TOKEN` (kept separate from `GITHUB_DISPATCH_TOKEN`, which is scoped only for `repository_dispatch`). Issue creation is fail-soft — a GitHub API failure never blocks the visitor's submission. `/admin/suggestions` lists all submissions (same `ADMIN_USER_ID` guard as `/admin/flags`) with a live Open/Closed badge fetched from the GitHub API at render time — GitHub remains the source of truth for status; there's no webhook/sync-back into Supabase.

### Database

Supabase (Postgres + Auth with RLS), schema in `supabase-schema.sql`: `profiles`, `progress`, `saved_lectures`, `comments`, `lecture_descriptions`, `speaker_overrides`, `suggestions`, plus `pending_lectures`/`failed_ingestions`/category-flag tables used by the ingest pipeline (`lib/ingest/lectures-writer.ts`) and reviewed at `/admin/flags`.

### Tests

Vitest, `node` environment, `@/*` path alias. Current coverage is the ingest/zoom pipeline only: `lib/ingest/__tests__/`, `lib/zoom/__tests__/`.
