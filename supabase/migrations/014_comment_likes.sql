-- 014_comment_likes.sql
--
-- Adds:
--   1. public.comment_likes — one row per (comment, user) like

create table if not exists public.comment_likes (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (comment_id, user_id)
);

create index if not exists comment_likes_comment_id_idx on public.comment_likes (comment_id);
create index if not exists comment_likes_user_id_idx    on public.comment_likes (user_id);

alter table public.comment_likes enable row level security;

-- Any authenticated user can read likes.
create policy "comment_likes_select_authenticated"
  on public.comment_likes for select
  to authenticated
  using (true);

-- Users can only insert their own likes.
create policy "comment_likes_insert_self"
  on public.comment_likes for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Users can only delete their own likes.
create policy "comment_likes_delete_self"
  on public.comment_likes for delete
  to authenticated
  using (auth.uid() = user_id);
