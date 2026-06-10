# YBT Shiurim

A library of 18,000+ shiurim from Yeshiva Bnei Torah — browse by category, search, listen with resume, discuss, and install as an app on your phone.

**Web:** works in any browser. **Mobile app:** this site is an installable PWA (Progressive Web App) — no app store needed, free on Android and iPhone, with offline downloads.

## Installing the app on your phone

- **Android (Chrome):** open the site → tap the **Install** prompt (or browser menu → *Add to Home screen* → *Install*).
- **iPhone (Safari):** open the site → tap **Share** → **Add to Home Screen**.

The installed app opens full-screen, keeps you signed in, supports lock-screen playback controls, and plays downloaded shiurim with no connection.

Because the app *is* the website, every deploy updates the installed app automatically the next time it's opened — there is no separate mobile codebase or release process.

## Features

- **Browse** a hierarchical category tree (Chumash, Talmud, Halacha, …)
- **Search** 18k+ shiurim with fuzzy matching (Fuse.js), filterable by rabbi/category/date
- **Listen** with playback speeds 0.5×–2×, ±15/30s skip, keyboard shortcuts, lock-screen / Bluetooth controls (Media Session API)
- **Progress sync** — position auto-saves every 10 s to Supabase, resumes on any device; completed shiurim are tracked (and never downgraded)
- **Offline downloads** — save shiurim to the device (browser Cache Storage) and play them in airplane mode; manage them at `/downloads`
- **Offline-resilient progress** — saves made while offline are queued in localStorage and flushed when the connection returns
- **Saved shiurim** (bookmarks), listening stats, per-shiur discussions and a global comment feed

## Tech stack

| Layer | Tech |
|---|---|
| Framework | Next.js (App Router) + TypeScript + Tailwind CSS |
| Backend | Supabase (Postgres + Auth with RLS) |
| Hosting | Vercel |
| Audio storage | Cloudflare R2 + externally hosted files (ybt.org, yutorah.org) |
| PWA | Hand-rolled service worker (`public/sw.js`) + web manifest (`app/manifest.ts`) |

## Architecture notes

### Lecture data pipeline

`data/lectures.json` (9.4 MB, ~19k lectures) is the source of truth. At build time, `scripts/generate-node-data.mjs` splits it into static files under `public/lectures-data/` served from Vercel's CDN:

- `<nodeId>.json` — per-folder chunks for the browse pages
- `index.json` — top-level category summary
- `catalog.json` — full flat lecture list, **fetched lazily** by `lib/client-catalog.ts` for search and client-side lookups (it is deliberately *not* bundled into the JS payload)
- `tree.json` / `speakers.json` — tiny files for the sidebar

Server code reads the JSON directly via `lib/lectures.ts` (server-only). Client components use `lib/lecture-utils.ts` (pure types/helpers) + `lib/client-catalog.ts` (fetched data). **Don't import `lib/lectures.ts` from a client component** — that would put the 9.4 MB JSON back into the bundle.

### Service worker (`public/sw.js`)

Hand-written (no bundler plugin — survives Next.js bundler changes):

- **Pages:** network-first, cached fallback, `/offline` fallback page
- **Precached shell:** `/`, `/offline` and `/downloads` (plus the chunks their HTML references) are cached at install and refreshed at most once per 24h, so Downloads is reachable offline without a prior visit; every other page needs one online visit first
- **`/_next/static/`:** cache-first (immutable hashed assets)
- **`/lectures-data/`, icons, images:** stale-while-revalidate
- **`/api/download/:id`:** served from the `audio-downloads-v1` cache **with Range support** (so seeking works offline); this cache is written only by `lib/downloads.ts`
- Registered by `components/pwa/ServiceWorkerRegister.tsx` (production only)

### Offline downloads

`lib/downloads.ts` fetches audio through the same-origin `/api/download/[id]` proxy (the upstream hosts don't send CORS headers), stores the bytes in Cache Storage, and keeps metadata in localStorage. The player (`lib/player-context.tsx`) automatically plays the cached copy when present, otherwise streams from the original host.

**Caveats to be aware of:**

- Each download streams the full file through the Vercel proxy — at large scale, watch the bandwidth quota (Hobby: 100 GB/mo). Long-term option: serve R2-hosted files directly by enabling CORS on the bucket.
- Browser storage is quota-limited and (rarely) evictable, especially on iOS. The app requests persistent storage and reconciles missing files on the Downloads page.
- Most audio is hosted by ybt.org / yutorah.org. Downloading externally hosted content for offline use may be subject to those sites' terms of service — review before promoting the feature widely.
- iOS runs PWAs slightly less reliably than native apps for long background playback; audio with the screen locked works, but iOS may reclaim the app under memory pressure.
- **iOS storage is per-app:** the installed home-screen app and the Safari tab have *separate* storage — shiurim downloaded in Safari do not appear in the installed app (and vice versa). Save them inside the app you'll listen from.

## Development

```bash
npm install
npm run dev        # regenerates public/lectures-data/, then starts next dev
npm run build      # production build (Vercel runs this)
```

Required env vars (`.env.local`):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

One-off scripts:

```bash
node scripts/generate-icons.mjs   # regenerate PWA icons from public/YBT_Logo.gif
```

Notes:

- The service worker is disabled in `next dev`. To test PWA behavior locally: `npm run build && npm start`, then use Chrome DevTools → Application. Full verification (install prompt, offline) is easiest against the deployed HTTPS site.
- Database schema lives in `supabase-schema.sql` (tables: `profiles`, `progress`, `saved_lectures`, `comments`, `lecture_descriptions`, `speaker_overrides` — all with RLS).

## Future ideas

- Native deep-link email confirmation (currently sign-up confirmation opens in the browser via `/auth/confirm` — works fine, just not fancy)
- Hardened session storage / encrypted local data
- Migrating externally hosted audio into R2 for reliability + direct CORS downloads
- Update toast ("new version available — refresh") instead of silent next-launch updates
