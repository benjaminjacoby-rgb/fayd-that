-- 009_settle_bet_self_mediation.sql
--
-- Patches the bet-resolution RPC so the self-mediated flow works:
--   * For mediator_type='self', the poster IS the mediator. The prior
--     implementation only checked `mediator_id`, which the create-bet flow
--     leaves NULL for self-mediation, so settle_bet incorrectly fell through
--     to vote-majority and threw "majority not reached".
--   * For mediator_type='requested' with mediator_id set, behaviour is
--     unchanged: the assigned mediator settles.
--   * For mediator_type='none' (or 'requested' with no accepted mediator),
--     resolution requires the same vote majority as before.
--
-- Also makes the participant set deterministic (used both for vote-majority
-- math and for surfacing the "Disputed" state on the UI): it now includes
-- the bet poster + every distinct sub-contract creator + every distinct
-- counter-party filler. Self-fills (filler === contract creator, the stake
-- marker created at post time) no longer cause duplicate counting.

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
  effective_mediator uuid;
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

  -- Resolve effective mediator: for self-mediation, the poster is the mediator
  -- even though the column is NULL. For requested-mediation, we only honour
  -- it once a specific mediator has been assigned.
  if bet_row.mediator_type = 'self' then
    effective_mediator := bet_row.poster_id;
  elsif bet_row.mediator_type = 'requested' and bet_row.mediator_id is not null then
    effective_mediator := bet_row.mediator_id;
  else
    effective_mediator := null;
  end if;

  -- Participant set: poster + sub-contract creators + counter-party fillers
  -- (anyone who put money in). Distinct so vote-majority math doesn't double-
  -- count anyone with multiple fills.
  select coalesce(array_agg(distinct user_id), array[]::uuid[]) into participants
  from (
    select bet_row.poster_id as user_id where bet_row.poster_id is not null
    union
    select c.creator_id
      from public.contracts c
     where c.bet_id = target_bet_id
       and c.creator_id is not null
    union
    select f.filler_id
      from public.fills f
      join public.contracts c on c.id = f.contract_id
     where c.bet_id = target_bet_id
       and f.filler_id is not null
       and f.filler_id <> c.creator_id
  ) p;
  participant_count := coalesce(array_length(participants, 1), 0);

  -- Authorization
  if effective_mediator is not null then
    if auth.uid() <> effective_mediator then
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
      needed := participant_count;          -- 2-person: unanimous required
    else
      needed := (participant_count / 2) + 1; -- 3+: simple majority
    end if;
    if agree_count < needed then
      raise exception 'majority not reached (%/% for %)', agree_count, needed, winning_side;
    end if;
  end if;

  -- Pay winners. Each fill row represents one stake; the staker's side is
  -- the contract's stated position (when filler === creator, i.e. the
  -- self-fill stake marker) or the opposite of it (counter-party fills).
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
        -- Total payout = stake / odds (e.g. $7 @ 50% → $14). The stake was
        -- debited at post/fill time, so this is gross-payout, not profit.
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
