-- 013_settle_bet_correct_payout.sql
--
-- Replaces the settle_bet RPC with a corrected payout model:
--
--   OLD (buggy for partial fills):
--     Each fill pays  fill.amount / their_odds
--     → For a partial-fill self-fill this exceeds the total pool.
--
--   NEW (always pays exactly the matched pool):
--     Iterate per CONTRACT, not per fill.
--     * Creator wins → credit (self_fill + total_external) for that contract
--       (the entire pot: their own locked stake + all filler stakes)
--     * Fillers win  → each filler gets fill.amount / filler_odds (payout at their odds)
--                     creator gets back max(0, self_fill − total_external × creator_odds/filler_odds)
--                     (the unmatched portion of their stake)
--
-- When fully filled, these formulae produce the same result as the old code.
-- When partially filled, the new code pays the correct amount and refunds the
-- unmatched creator stake without over-paying.
--
-- Also adds:
--   4. bets.winning_side text column — stores which side won so the History
--      tab can display "YES won" / "NO won" without re-deriving it from votes.

-- ────────────────────────────────────────────────
-- 4. bets.winning_side column
-- ────────────────────────────────────────────────
alter table public.bets add column if not exists winning_side text
  check (winning_side in ('YES','NO'));

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
  bet_row            public.bets%rowtype;
  participants       uuid[];
  participant_count  int;
  agree_count        int;
  needed             int;
  contract_row       record;
  fill_row           record;
  creator_odds       numeric;
  filler_odds        numeric;
  self_fill_amount   numeric;
  total_external     numeric;
  win_amount         numeric;
  unmatched          numeric;
  v_winning_side     text;
begin
  -- Copy parameter to local var to avoid column/param name collision in UPDATE.
  v_winning_side := winning_side;

  -- ── Validate winning_side ───────────────────────────────────────────────
  if winning_side not in ('YES','NO') then
    raise exception 'invalid winning_side: %', winning_side;
  end if;

  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.status = 'settled' or bet_row.is_concluded then
    raise exception 'bet already resolved';
  end if;

  -- ── Participant set: poster + unique fillers ────────────────────────────
  select coalesce(array_agg(distinct user_id), array[]::uuid[]) into participants
  from (
    select bet_row.poster_id as user_id
      where bet_row.poster_id is not null
    union
    select f.filler_id
      from public.fills f
      join public.contracts c on c.id = f.contract_id
     where c.bet_id = target_bet_id
       and f.filler_id is not null
  ) p;
  participant_count := coalesce(array_length(participants, 1), 0);

  -- ── Authorization check ─────────────────────────────────────────────────
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
      needed := participant_count;
    else
      needed := (participant_count / 2) + 1;
    end if;
    if agree_count < needed then
      raise exception 'majority not reached (%/% for %)', agree_count, needed, winning_side;
    end if;
  end if;

  -- ── Payout per contract ─────────────────────────────────────────────────
  for contract_row in
    select c.id, c.creator_id, c.position, c.odds
      from public.contracts c
     where c.bet_id = target_bet_id
       and c.creator_id is not null
  loop
    -- Odds from the creator's perspective.
    if contract_row.position = 'YES' then
      creator_odds := contract_row.odds / 100.0;
    else
      creator_odds := 1.0 - (contract_row.odds / 100.0);
    end if;
    filler_odds := 1.0 - creator_odds;

    -- Self-fill: the creator's own locked stake on this contract.
    select coalesce(sum(f.amount), 0) into self_fill_amount
      from public.fills f
     where f.contract_id = contract_row.id
       and f.filler_id = contract_row.creator_id;

    -- External fills: counterparty stakes.
    select coalesce(sum(f.amount), 0) into total_external
      from public.fills f
     where f.contract_id = contract_row.id
       and f.filler_id is distinct from contract_row.creator_id;

    if contract_row.position = winning_side then
      -- ── Creator wins: entire pot goes to creator ─────────────────────────
      -- (self_fill_amount already includes both matched and unmatched stake,
      --  so we just add the external stakes on top.)
      win_amount := self_fill_amount + total_external;
      if win_amount > 0 then
        update public.users
           set wallet_balance = coalesce(wallet_balance, 0) + win_amount
         where id = contract_row.creator_id;
      end if;
    else
      -- ── Fillers win ───────────────────────────────────────────────────────
      -- Pay each external filler at their odds (fill / filler_odds).
      if filler_odds > 0 and total_external > 0 then
        for fill_row in
          select f.filler_id, f.amount
            from public.fills f
           where f.contract_id = contract_row.id
             and f.filler_id is distinct from contract_row.creator_id
             and f.filler_id is not null
        loop
          win_amount := fill_row.amount / filler_odds;
          update public.users
             set wallet_balance = coalesce(wallet_balance, 0) + win_amount
           where id = fill_row.filler_id;
        end loop;
      end if;

      -- Refund the creator's unmatched stake (the portion nobody took).
      -- matched_from_creator = total_external × (creator_odds / filler_odds)
      -- unmatched            = max(0, self_fill_amount − matched_from_creator)
      if self_fill_amount > 0 then
        if filler_odds > 0 then
          unmatched := greatest(0, self_fill_amount - total_external * creator_odds / filler_odds);
        else
          -- Edge case: filler_odds = 0 means creator posted 100% probability —
          -- no one can take the other side, so the full stake is unmatched.
          unmatched := self_fill_amount;
        end if;
        if unmatched > 0 then
          update public.users
             set wallet_balance = coalesce(wallet_balance, 0) + unmatched
           where id = contract_row.creator_id;
        end if;
      end if;
    end if;
  end loop;

  -- ── Mark bet settled ────────────────────────────────────────────────────
  update public.bets
     set status = 'settled', is_concluded = true, winning_side = v_winning_side
   where id = target_bet_id;
end;
$$;

grant execute on function public.settle_bet(uuid, text) to authenticated;
