-- 006_comments_and_resolution.sql
--
-- Adds:
--   1. public.comments — feed bet-card discussion
--   2. one-vote-per-bet uniqueness on public.votes
--   3. 'settled' as a valid bets.status (alongside open/filled/concluded)
--   4. public.settle_bet(bet_id, winning_side) — atomic payout + status flip,
--      callable by the mediator OR by any participant once vote-majority is met.

-- ────────────────────────────────────────────────
-- comments
-- ────────────────────────────────────────────────
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  bet_id      uuid not null references public.bets(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  content     text not null,
  created_at  timestamptz not null default now()
);
create index if not exists comments_bet_id_idx     on public.comments (bet_id);
create index if not exists comments_created_at_idx on public.comments (created_at desc);

alter table public.comments enable row level security;

create policy "comments_select_bet_visible"
  on public.comments for select
  to authenticated
  using (
    exists (select 1 from public.bets b where b.id = comments.bet_id)
  );

create policy "comments_insert_self"
  on public.comments for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- votes: one vote per (bet, voter)
-- ────────────────────────────────────────────────
create unique index if not exists votes_bet_voter_unique
  on public.votes (bet_id, voter_id);

-- ────────────────────────────────────────────────
-- bets.status: allow 'settled'
-- ────────────────────────────────────────────────
alter table public.bets drop constraint if exists bets_status_check;
alter table public.bets
  add constraint bets_status_check
  check (status in ('open','filled','concluded','settled'));

-- ────────────────────────────────────────────────
-- settle_bet RPC
-- ────────────────────────────────────────────────
create or replace function public.settle_bet(
  target_bet_id uuid,
  winning_side  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bet_row           public.bets%rowtype;
  participants      uuid[];
  participant_count int;
  agree_count       int;
  needed            int;
  fill_row          record;
  side_for_fill     text;
  their_odds        numeric;
  win_amount        numeric;
begin
  if winning_side not in ('YES','NO') then
    raise exception 'invalid winning_side: %', winning_side;
  end if;

  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.status = 'settled' or bet_row.is_concluded then
    raise exception 'bet already resolved';
  end if;

  -- Participant set: poster + unique fillers on this bet.
  select coalesce(array_agg(distinct user_id), array[]::uuid[]) into participants
  from (
    select bet_row.poster_id as user_id where bet_row.poster_id is not null
    union
    select f.filler_id
      from public.fills f
      join public.contracts c on c.id = f.contract_id
     where c.bet_id = target_bet_id
       and f.filler_id is not null
  ) p;
  participant_count := coalesce(array_length(participants, 1), 0);

  -- Authorization: mediator (when one is assigned) OR majority vote of participants.
  if bet_row.mediator_id is not null and bet_row.mediator_type <> 'none' then
    if auth.uid() <> bet_row.mediator_id then
      raise exception 'only the assigned mediator can settle this bet';
    end if;
  else
    if not (auth.uid() = any(participants)) then
      raise exception 'only a participant can vote-settle this bet';
    end if;
    select count(*) into agree_count
      from public.votes v
     where v.bet_id = target_bet_id
       and v.vote = winning_side
       and v.voter_id = any(participants);
    if participant_count <= 2 then
      needed := participant_count;  -- 2-person: both must agree
    else
      needed := (participant_count / 2) + 1;  -- simple majority for 3+
    end if;
    if agree_count < needed then
      raise exception 'majority not reached (%/% for %)', agree_count, needed, winning_side;
    end if;
  end if;

  -- Pay winners. Each fill row represents one stake; the staker's side is
  -- the contract's position (for self-fills, where filler = creator) or the
  -- opposite of it (for external fills).
  for fill_row in
    select f.amount, f.filler_id, c.creator_id, c.position, c.odds
      from public.fills f
      join public.contracts c on c.id = f.contract_id
     where c.bet_id = target_bet_id
       and f.filler_id is not null
  loop
    if fill_row.filler_id = fill_row.creator_id then
      side_for_fill := fill_row.position;
    else
      side_for_fill := case when fill_row.position = 'YES' then 'NO' else 'YES' end;
    end if;

    if side_for_fill = winning_side then
      if side_for_fill = 'YES' then
        their_odds := fill_row.odds / 100.0;
      else
        their_odds := 1 - (fill_row.odds / 100.0);
      end if;
      if their_odds > 0 then
        win_amount := fill_row.amount / their_odds;
        update public.users
           set wallet_balance = coalesce(wallet_balance, 0) + win_amount
         where id = fill_row.filler_id;
      end if;
    end if;
  end loop;

  update public.bets
     set status = 'settled', is_concluded = true
   where id = target_bet_id;
end;
$$;

grant execute on function public.settle_bet(uuid, text) to authenticated;
