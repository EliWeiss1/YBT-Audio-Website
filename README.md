# YBT Shiurim

A library of 18,000+ Torah shiurim (lectures) from Yeshiva Bnei Torah — browse by category, search, listen with resume-playback, discuss, and install as an app on your phone.

Built to solve a real access problem: shiurim were scattered across multiple third-party sites with no way to browse them in one place, and the sites themselves were clunky, with users regularly complaining about how hard they were to navigate. This project consolidates everything into one fast, searchable, installable site with progress tracking that the old sites never had.

**Live app code lives in [`shiurim-app/`](shiurim-app/)** — see [`shiurim-app/README.md`](shiurim-app/README.md) for features, architecture, and the tech stack, and [`shiurim-app/SETUP.md`](shiurim-app/SETUP.md) for local dev setup. This repo root just holds `.github/workflows/` (CI/cron jobs) and misc top-level files.

## Highlights

- **Search & browse** 18k+ shiurim with fuzzy search, filterable by rabbi/category/date, across a deep hierarchical category tree
- **Progress tracking** — playback position auto-saves and resumes on any device; completed shiurim are tracked
- **Offline downloads** via an installable PWA (no app store needed) — listen with no connection
- **Four independent automated ingest pipelines** (email/Zoom parsing, Google Drive sync, Dropbox sync, and a bulk migration scraper) with AI-assisted categorization, so new recordings are added with zero manual work
- **Public read-only REST API** and admin tooling for content review, all running on scheduled GitHub Actions

## Tech stack

Next.js (App Router) + TypeScript + Tailwind CSS · Supabase (Postgres + Auth) · Vercel · Cloudflare R2 · GitHub Actions · Anthropic API

## Other folders

- [`speaker-isolation/`](speaker-isolation/) — a standalone Python pipeline that strips background/student voices from raw shiur recordings using per-rabbi voice profiles.
