-- ============================================
-- SHIURIM APP - Supabase Schema
-- Paste this into your Supabase SQL editor
-- ============================================

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ============================================
-- PROFILES
-- Extends Supabase's built-in auth.users table
-- ============================================
create table public.profiles (
  id uuid references auth.users on delete cascade primary key,
  username text unique,
  display_name text,
  avatar_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================
-- PROGRESS
-- Tracks per-user progress on each lecture
-- ============================================
create table public.progress (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  lecture_id text not null,                   -- matches the "id" field in your JSON
  position_seconds integer default 0,         -- where they left off (in seconds)
  completed boolean default false,
  last_listened_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()),
  unique(user_id, lecture_id)                 -- one row per user per lecture
);

-- ============================================
-- COMMENTS
-- Per-lecture discussions + central feed
-- ============================================
create table public.comments (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,
  lecture_id text not null,                   -- matches the "id" field in your JSON
  parent_id uuid references public.comments(id) on delete cascade, -- null = top-level, set = reply
  body text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()),
  updated_at timestamp with time zone default timezone('utc'::text, now())
);

-- Index for fast lecture comment lookups
create index comments_lecture_id_idx on public.comments(lecture_id);
-- Index for fast feed queries (recent activity across all lectures)
create index comments_created_at_idx on public.comments(created_at desc);

-- ============================================
-- ROW LEVEL SECURITY
-- Controls who can read/write what
-- ============================================

-- Profiles: anyone can read, only you can update yours
alter table public.profiles enable row level security;
create policy "Profiles are viewable by everyone" on public.profiles for select using (true);
create policy "Users can update their own profile" on public.profiles for update using (auth.uid() = id);

-- Progress: private per user
alter table public.progress enable row level security;
create policy "Users can view their own progress" on public.progress for select using (auth.uid() = user_id);
create policy "Users can insert their own progress" on public.progress for insert with check (auth.uid() = user_id);
create policy "Users can update their own progress" on public.progress for update using (auth.uid() = user_id);

-- Comments: anyone can read, logged-in users can post, only author can edit/delete
alter table public.comments enable row level security;
create policy "Comments are viewable by everyone" on public.comments for select using (true);
create policy "Logged-in users can post comments" on public.comments for insert with check (auth.uid() = user_id);
create policy "Users can update their own comments" on public.comments for update using (auth.uid() = user_id);
create policy "Users can delete their own comments" on public.comments for delete using (auth.uid() = user_id);

-- ============================================
-- HELPFUL VIEW: Feed with lecture + user info
-- Use this for the central feed page
-- ============================================
create view public.feed_comments as
  select
    c.id,
    c.lecture_id,
    c.body,
    c.parent_id,
    c.created_at,
    p.display_name,
    p.username,
    p.avatar_url
  from public.comments c
  join public.profiles p on c.user_id = p.id
  where c.parent_id is null  -- only top-level posts in the feed
  order by c.created_at desc;

-- ============================================
-- LECTURE DESCRIPTIONS
-- User-contributed descriptions for shiurim.
-- One row per lecture; any logged-in user can
-- create or update the description.
-- Run this block if adding to an existing deployment.
-- ============================================
create table public.lecture_descriptions (
  lecture_id text primary key,
  body text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamp with time zone default now()
);

alter table public.lecture_descriptions enable row level security;
create policy "Descriptions are viewable by everyone"
  on public.lecture_descriptions for select using (true);
create policy "Logged-in users can insert descriptions"
  on public.lecture_descriptions for insert with check (auth.uid() is not null);
create policy "Logged-in users can update descriptions"
  on public.lecture_descriptions for update using (auth.uid() is not null);

-- ============================================
-- SPEAKER OVERRIDES
-- Crowd-sourced rabbi/speaker corrections.
-- Any logged-in user can correct the speaker
-- on a shiur. One override row per lecture.
-- Run this block if adding to an existing deployment.
-- ============================================
create table public.speaker_overrides (
  lecture_id text primary key,
  speaker text not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamp with time zone default now()
);

alter table public.speaker_overrides enable row level security;
create policy "Speaker overrides are viewable by everyone"
  on public.speaker_overrides for select using (true);
create policy "Logged-in users can insert speaker overrides"
  on public.speaker_overrides for insert with check (auth.uid() is not null);
create policy "Logged-in users can update speaker overrides"
  on public.speaker_overrides for update using (auth.uid() is not null);

-- ============================================
-- ZOOM OAUTH TOKENS
-- Stores per-ingest-email Zoom OAuth tokens for
-- the shiur ingestion pipeline. Written only by
-- the server (service role key) via
-- /api/zoom/authorize and /api/zoom/callback.
-- No client-side access, so RLS has no policies
-- (service role bypasses RLS; everyone else is
-- denied by default).
-- Run this block if adding to an existing deployment.
-- ============================================
create table public.zoom_oauth_tokens (
  sender_email text primary key,
  zoom_user_id text not null,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamp with time zone not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.zoom_oauth_tokens enable row level security;

-- ============================================
-- SUGGESTIONS
-- Anonymous bug reports / feature requests from
-- the public /feedback page. Written only by the
-- server (service role key) via /api/feedback,
-- which also files a matching GitHub Issue.
-- No client-side access, so RLS has no policies
-- (service role bypasses RLS; everyone else is
-- denied by default).
-- Run this block if adding to an existing deployment.
-- ============================================
create table public.suggestions (
  id uuid default uuid_generate_v4() primary key,
  type text not null check (type in ('bug', 'feature')),
  description text not null,
  submitted_by text,                          -- display name of the logged-in submitter, null if anonymous
  github_issue_number integer,
  github_issue_url text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.suggestions enable row level security;

-- ============================================
-- DRIVE INGEST LOG
-- Dedup + audit trail for the Google Drive ingest
-- pipeline (scripts/drive-sync.mjs, run daily by
-- .github/workflows/drive-ingest.yml). One row per
-- Drive file id: the daily poll skips any file whose
-- row is status='done'. Written only by the server /
-- worker (service role key). No client-side access,
-- so RLS has no policies (service role bypasses RLS;
-- everyone else is denied by default).
-- Run this block if adding to an existing deployment.
-- ============================================
create table public.drive_ingest_log (
  file_id text primary key,                   -- Google Drive file id (stable, unique)
  lecture_id text,                            -- the id written to pending_lectures on success
  file_name text,
  title text,
  speaker text,
  node_path jsonb,                            -- categorizer placement, for the audit trail
  status text not null,                       -- 'done' | 'parse_failed' | 'error'
  error text,
  ingested_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.drive_ingest_log enable row level security;

-- ============================================
-- DROPBOX INGEST LOG
-- Dedup + audit trail for the Dropbox ingest
-- pipeline (scripts/dropbox-sync.mjs, run daily by
-- .github/workflows/dropbox-ingest.yml). Mirrors
-- drive_ingest_log; one row per Dropbox file id.
-- The daily poll skips any file whose row is
-- status='done'. Written only by the worker
-- (service role key); no client-side access.
-- Run this block if adding to an existing deployment.
-- ============================================
create table public.dropbox_ingest_log (
  file_id text primary key,                   -- Dropbox file id (stable "id:...")
  lecture_id text,                            -- the id written to pending_lectures on success
  file_name text,
  title text,
  speaker text,
  node_path jsonb,                            -- categorizer placement, for the audit trail
  status text not null,                       -- 'done' | 'parse_failed' | 'error'
  error text,
  ingested_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table public.dropbox_ingest_log enable row level security;

-- The Drive per-rabbi fallback creates a new tree node (e.g. a "Rabbi Bald" folder under
-- Gemarah) at build time; its label rides along on the pending_lectures row. Add the column
-- to the existing pending_lectures table (which lives outside this file). Null for every
-- normal placement into an existing node (Zoom + most Drive shiurim).
alter table public.pending_lectures add column if not exists node_label text;
