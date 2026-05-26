-- 007_bet_visibility_and_expiration.sql
--
-- 1. bet_targets — explicit per-bet recipient list for audience_type =
--    'specific_friends'. The schema previously dropped target_friend_ids on
--    insert, so visibility for that audience could not be enforced.
-- 2. bets.expires_at — optional poster-chosen expiry (nullable). Distinct
--    from the existing end_date field, which is repurposed as a backend
--    default.
-- 3. New SELECT policy on bets driven by a SECURITY DEFINER helper. A
--    previous attempt at writing the policy inline triggered RLS recursion
--    when the predicate referenced friendships/group_members (which have
--    their own RLS), so we now route the check through a definer function
--    that runs with bypass-RLS rights. The policy itself stays a thin
--    `using (user_can_see_bet(auth.uid(), bets))` call.

-- ────────────────────────────────────────────────
-- 1. bet_targets
-- ────────────────────────────────────────────────
create table if not exists public.bet_targets (
  bet_id      uuid not null references public.bets(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (bet_id, user_id)
);
create index if not exists bet_targets_user_id_idx on public.bet_targets (user_id);

alter table public.bet_targets enable row level security;

-- The poster (and the targeted user) need to read these rows so the UI
-- can show "Sent to N friends". The visibility helper below also reads
-- this table, but via SECURITY DEFINER so it bypasses these policies.
create policy "bet_targets_select_self_or_poster"
  on public.bet_targets for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.bets b where b.id = bet_targets.bet_id and b.poster_id = auth.uid())
  );

create policy "bet_targets_insert_poster"
  on public.bet_targets for insert
  to authenticated
  with check (
    exists (select 1 from public.bets b where b.id = bet_targets.bet_id and b.poster_id = auth.uid())
  );

-- ────────────────────────────────────────────────
-- 2. bets.expires_at
-- ────────────────────────────────────────────────
alter table public.bets
  add column if not exists expires_at timestamptz;
create index if not exists bets_expires_at_idx on public.bets (expires_at);

-- ────────────────────────────────────────────────
-- 3. Visibility helper + policy
-- ────────────────────────────────────────────────
-- SECURITY DEFINER so the policy can consult friendships / group_members /
-- bet_targets without recursing through their own RLS. STABLE because the
-- function is pure for a given (uid, bet) within a statement, which lets
-- the planner cache the result per row.
create or replace function public.user_can_see_bet(
  uid          uuid,
  bet_id       uuid,
  poster_id    uuid,
  audience     text,
  bet_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    case
      when uid is null then false
      when poster_id = uid then true
      when audience = 'group' and bet_group_id is not null then
        exists (
          select 1 from public.group_members gm
           where gm.group_id = bet_group_id
             and gm.user_id  = uid
        )
      when audience = 'specific_friends' then
        exists (
          select 1 from public.bet_targets bt
           where bt.bet_id  = user_can_see_bet.bet_id
             and bt.user_id = uid
        )
      when audience = 'friends' then
        exists (
          select 1 from public.friendships f
           where f.status = 'accepted'
             and (
               (f.requester_id = poster_id and f.addressee_id = uid)
               or
               (f.addressee_id = poster_id and f.requester_id = uid)
             )
        )
      else false
    end
$$;

grant execute on function public.user_can_see_bet(uuid, uuid, uuid, text, uuid)
  to authenticated;

-- Replace the old open policy with the visibility-gated one.
drop policy if exists "bets_select_authenticated" on public.bets;

create policy "bets_select_visible"
  on public.bets for select
  to authenticated
  using (
    public.user_can_see_bet(
      auth.uid(),
      bets.id,
      bets.poster_id,
      bets.audience_type,
      bets.group_id
    )
  );
