# Shiurim Library — Setup Guide

## What's Been Built

A full-stack Next.js web app with:
- 📂 Hierarchical category/subcategory navigation sidebar
- 🔍 Instant fuzzy search across all lectures
- 🎵 Persistent bottom audio player (keeps playing while you browse)
- ✅ Per-user progress tracking (resume mid-lecture, completion checkmarks)
- 💬 Per-lecture threaded discussion (questions + replies)
- 🗣️ Central discussion feed (recent comments across all shiurim)
- 👤 User auth (sign up / sign in / sign out)

---

## File Structure

```
shiurim-app/
├── app/
│   ├── layout.tsx          ← Root layout (sidebar + player + auth)
│   ├── page.tsx            ← Home page (category grid)
│   ├── globals.css         ← Global styles + design tokens
│   ├── auth/
│   │   └── page.tsx        ← Sign in / Sign up page
│   ├── feed/
│   │   └── page.tsx        ← Central discussion feed
│   └── lectures/
│       ├── page.tsx        ← Lecture list (filterable by category/subcategory)
│       └── [id]/
│           └── page.tsx    ← Individual lecture page
├── components/
│   ├── layout/
│   │   └── Sidebar.tsx     ← Collapsible nav + search
│   ├── player/
│   │   ├── BottomPlayer.tsx ← Persistent audio bar
│   │   └── LecturePlayer.tsx ← Play button on lecture page
│   ├── lectures/
│   │   └── LectureCard.tsx  ← Lecture row in list view
│   └── discussions/
│       └── CommentsSection.tsx ← Comments + replies UI
├── lib/
│   ├── supabase.ts         ← Supabase client + all DB helpers
│   ├── lectures.ts         ← Data helpers (search, lookup, formatting)
│   └── player-context.tsx  ← Global audio player state
├── data/
│   └── lectures.json       ← YOUR LECTURE DATA GOES HERE
├── supabase-schema.sql     ← Paste into Supabase SQL editor
└── .env.local.example      ← Copy to .env.local and fill in keys
```

---

## Step-by-Step Setup

### Step 1 — Install Node.js
If you don't have it: https://nodejs.org (download the LTS version)

### Step 2 — Set up Supabase (free)
1. Go to https://supabase.com and create a free account
2. Click **New Project**, give it a name (e.g. "shiurim")
3. Choose a region close to your users, set a database password
4. Wait ~2 minutes for it to provision
5. Go to **SQL Editor** (left sidebar)
6. Paste the entire contents of `supabase-schema.sql` and click **Run**
7. Go to **Settings → API**
8. Copy your **Project URL** and **anon/public** key

### Step 3 — Configure environment variables
```bash
# In the shiurim-app folder:
cp .env.local.example .env.local
```
Open `.env.local` and fill in your Supabase URL and anon key:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

### Step 4 — Install dependencies and run
```bash
cd shiurim-app
npm install
npm run dev
```
Open http://localhost:3000 — your app is running!

---

## Step 5 — Add Your Lecture Data

Edit `data/lectures.json`. The structure is:

```json
{
  "categories": [
    {
      "id": "unique-id",          ← used in URLs, no spaces
      "label": "Display Name",    ← shown in the UI
      "icon": "📖",               ← emoji icon
      "subcategories": [
        {
          "id": "subcategory-id",
          "label": "Subcategory Name",
          "lectures": [
            {
              "id": "lec-001",              ← unique, used for progress tracking
              "title": "Lecture Title",
              "audioUrl": "https://...",    ← direct link to MP3 file
              "duration": 3600,             ← length in seconds
              "description": "...",
              "speaker": "Rabbi Name",
              "date": "2024-01-15",         ← YYYY-MM-DD format
              "tags": ["tag1", "tag2"]
            }
          ]
        }
      ]
    }
  ]
}
```

**Tips for bulk import:**
- If your lectures are in a spreadsheet, you can ask Claude to convert CSV → JSON
- If audio files are on Google Drive / Dropbox, use their "share link" as the audioUrl
- For large libraries, consider hosting MP3s on AWS S3 or Cloudflare R2 (cheap/free)

---

## Step 6 — Deploy to Vercel (free)

1. Push your code to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   # Create a repo on github.com, then:
   git remote add origin https://github.com/yourusername/shiurim-app.git
   git push -u origin main
   ```

2. Go to https://vercel.com, sign in with GitHub
3. Click **New Project** → import your repo
4. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
5. Click **Deploy** — done! You get a free `.vercel.app` URL

**Custom domain:** In Vercel project settings → Domains, you can add any domain you own.

---

## How It All Works

### Audio player
- A global React context (`player-context.tsx`) holds the current lecture + playback state
- The `BottomPlayer` component reads from this context — it persists across page navigation
- Progress is saved to Supabase every 10 seconds while playing, and immediately on pause

### Progress tracking
- Each `(user_id, lecture_id)` pair has one row in the `progress` table
- `position_seconds` stores where they left off
- `completed = true` when the audio ends
- On the lecture page, if the user has progress, it shows "Resume from X:XX"

### Search
- Uses Fuse.js (fuzzy search) — no server calls needed, runs entirely in the browser
- Searches across title, description, speaker, tags, and subcategory name

### Discussion feed
- Comments are stored in Supabase with a `lecture_id` reference
- The feed page queries for top-level comments ordered by `created_at DESC`
- Clicking a feed item deep-links to the lecture page with `#comments` anchor

---

## Common Next Steps

| Feature | How to add |
|---|---|
| **Custom domain** | Add in Vercel settings |
| **Email auth confirmation** | Already built-in via Supabase |
| **Google sign-in** | Enable in Supabase → Auth → Providers |
| **Audio hosted on your server** | Update `audioUrl` fields in the JSON |
| **Admin panel to add lectures** | Ask Claude to build a `/admin` page |
| **RSS feed** | Ask Claude to add a `/api/rss` route |
| **Download count tracking** | Add a `plays` column to a `lecture_stats` table |

---

## Getting Help

If anything doesn't work, paste the error message to Claude and it can fix it.
Common issues:
- **"Cannot find module"** → run `npm install` again
- **Supabase errors** → double-check your `.env.local` keys
- **Audio won't play** → make sure the `audioUrl` is a direct link to an MP3 (not a webpage)
