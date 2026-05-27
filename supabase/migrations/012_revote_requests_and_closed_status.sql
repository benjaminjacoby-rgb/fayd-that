-- 012_revote_requests_and_closed_status.sql
--
-- Adds:
--   1. bets.status: allow 'closed' (needed by closeBet() client function)
--   2. public.revote_requests — tracks per-participant revote agreement
--   3. public.reset_votes_if_all_requested(target_bet_id) — RPC that clears
--      votes + requests once every participant has agreed to revote

-- ────────────────────────────────────────────────
-- 1. bets.status — add 'closed'
-- ────────────────────────────────────────────────
alter table public.bets drop constraint if exists bets_status_check;
alter table public.bets
  add constraint bets_status_check
  check (status in ('open','filled','closed','concluded','settled'));

-- ────────────────────────────────────────────────
-- 2. revote_requests table
-- ────────────────────────────────────────────────
create table if not exists public.revote_requests (
  id          uuid primary key default gen_random_uuid(),
  bet_id      uuid not null references public.bets(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- One request per (bet, user)
  unique (bet_id, user_id)
);

create index if not exists revote_requests_bet_id_idx on public.revote_requests (bet_id);

alter table public.revote_requests enable row level security;

-- Any authenticated user can read requests on bets they can see.
create policy "revote_requests_select_authenticated"
  on public.revote_requests for select
  to authenticated
  using (true);

-- Participants can insert their own request.
create policy "revote_requests_insert_self"
  on public.revote_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 3. reset_votes_if_all_requested RPC
--    Returns true  → all participants agreed; votes + requests cleared.
--    Returns false → still waiting on some participants.
-- ────────────────────────────────────────────────
create or replace function public.reset_votes_if_all_requested(
  target_bet_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  participants      uuid[];
  participant_count int;
  request_count     int;
begin
  -- Participant set: poster + unique fillers (same definition as settle_bet).
  select coalesce(array_agg(distinct user_id), array[]::uuid[]) into participants
  from (
    select b.poster_id as user_id
      from public.bets b
     where b.id = target_bet_id
       and b.poster_id is not null
    union
    select f.filler_id
      from public.fills f
      join public.contracts c on c.id = f.contract_id
     where c.bet_id = target_bet_id
       and f.filler_id is not null
  ) p;

  participant_count := coalesce(array_length(participants, 1), 0);
  if participant_count = 0 then
    return false;
  end if;

  -- Count how many distinct participants have submitted a revote request.
  select count(distinct r.user_id) into request_count
    from public.revote_requests r
   where r.bet_id = target_bet_id
     and r.user_id = any(participants);

  if request_count >= participant_count then
    -- All agreed — wipe votes and requests so a fresh round can begin.
    delete from public.votes         where bet_id = target_bet_id;
    delete from public.revote_requests where bet_id = target_bet_id;
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.reset_votes_if_all_requested(uuid) to authenticated;
