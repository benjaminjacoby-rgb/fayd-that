-- Issue 2: last_read_at column so the server can compute per-conversation
--   unread counts based on when each participant last viewed the chat.
alter table public.conversation_participants
  add column if not exists last_read_at timestamptz;

-- Issue 4: poll votes — thumbs-up/down on feed cards. One row per user per
--   bet; use UPSERT to toggle (delete the row to un-vote).
create table if not exists public.bet_poll_votes (
  id         uuid primary key default gen_random_uuid(),
  bet_id     uuid not null references public.bets(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  vote       text not null check (vote in ('yes', 'no')),
  created_at timestamptz not null default now(),
  unique (bet_id, user_id)
);

alter table public.bet_poll_votes enable row level security;

-- Authenticated users can read all poll votes (needed to show counts + own vote).
create policy "poll_votes_select"
  on public.bet_poll_votes for select
  to authenticated
  using (true);

-- Users can only insert rows for themselves.
create policy "poll_votes_insert"
  on public.bet_poll_votes for insert
  to authenticated
  with check (user_id = auth.uid());

-- Users can update (change yes↔no) only their own rows.
create policy "poll_votes_update"
  on public.bet_poll_votes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Users can delete (un-vote) only their own rows.
create policy "poll_votes_delete"
  on public.bet_poll_votes for delete
  to authenticated
  using (user_id = auth.uid());
