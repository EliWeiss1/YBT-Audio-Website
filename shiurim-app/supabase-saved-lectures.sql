-- ============================================
-- SAVED LECTURES
-- Run this in your Supabase SQL editor.
-- ============================================

create table public.saved_lectures (
  user_id   uuid references public.profiles(id) on delete cascade not null,
  lecture_id text not null,
  saved_at  timestamp with time zone default timezone('utc'::text, now()) not null,
  primary key (user_id, lecture_id)
);

alter table public.saved_lectures enable row level security;

create policy "Users can view their own saved lectures"
  on public.saved_lectures for select using (auth.uid() = user_id);

create policy "Users can save lectures"
  on public.saved_lectures for insert with check (auth.uid() = user_id);

create policy "Users can unsave lectures"
  on public.saved_lectures for delete using (auth.uid() = user_id);

-- Index for fast lookups ordered by recency
create index saved_lectures_user_saved_at_idx
  on public.saved_lectures(user_id, saved_at desc);
