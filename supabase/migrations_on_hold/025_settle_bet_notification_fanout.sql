-- 025_settle_bet_notification_fanout.sql
--
-- Restores the bet_won / bet_lost notification fan-out to settle_bet.
--
-- History of the regression:
--   010 — added the fan-out: one bet_won/bet_lost row per participant on settle,
--         skipping the settler themselves.
--   013 — rewrote settle_bet end-to-end for the corrected per-contract payout
--         model and dropped the fan-out block in the process.
--   015 — re-created settle_bet again (added settled_at). Fan-out not restored.
--   020 — re-created settle_bet again (restored effective-mediator resolution).
--         Fan-out not restored.
--
-- So since 013 a bet settles and pays out in silence. The UI has been ready for
-- these the whole time — src/app/notifications/NotificationsClient.tsx:195-205
-- and :245-246 both render `bet_won` and `bet_lost` with copy and an icon — so
-- this is a dead code path on the read side waiting for rows that stopped
-- being written.
--
-- Payout math, authorization, participant set and settled_at are all carried
-- over from 020 **unchanged**. The only differences are three new declarations
-- (participant_id, participant_won, actor) and the fan-out loop before the
-- final UPDATE.
--
-- Win/loss is derived per participant rather than tracked through the payout
-- loop, so it stays correct under 020's per-contract model:
--   * a self-fill (filler = contract creator) wins when that contract's
--     position matches the winning side;
--   * an external fill wins when the contract's position is the *opposite* of
--     the winning side.
-- Posters and sub-contract creators always hold at least one self-fill
-- (createBet and postSubContract both insert one), so the same lookup covers
-- every kind of participant.

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
  effective_mediator uuid;
  participant_id     uuid;
  participant_won    boolean;
  actor              uuid := auth.uid();
begin
  v_winning_side := winning_side;

  if v_winning_side not in ('YES','NO') then
    raise exception 'invalid winning_side: %', v_winning_side;
  end if;

  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.status = 'settled' or bet_row.is_concluded then
    raise exception 'bet already resolved';
  end if;

  select coalesce(array_agg(distinct user_id), array[]::uuid[]) into participants
  from (
    select bet_row.poster_id as user_id where bet_row.poster_id is not null
    union
    select f.filler_id
      from public.fills f
      join public.contracts c on c.id = f.contract_id
     where c.bet_id = target_bet_id and f.filler_id is not null
  ) p;
  participant_count := coalesce(array_length(participants, 1), 0);

  effective_mediator := public.bet_effective_mediator(bet_row);

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
       and v.vote = v_winning_side
       and v.voter_id = any(participants);
    if participant_count <= 2 then
      needed := participant_count;
    else
      needed := (participant_count / 2) + 1;
    end if;
    if agree_count < needed then
      raise exception 'majority not reached (%/% for %)', agree_count, needed, v_winning_side;
    end if;
  end if;

  for contract_row in
    select c.id, c.creator_id, c.position, c.odds
      from public.contracts c
     where c.bet_id = target_bet_id and c.creator_id is not null
  loop
    if contract_row.position = 'YES' then
      creator_odds := contract_row.odds / 100.0;
    else
      creator_odds := 1.0 - (contract_row.odds / 100.0);
    end if;
    filler_odds := 1.0 - creator_odds;

    select coalesce(sum(f.amount), 0) into self_fill_amount
      from public.fills f
     where f.contract_id = contract_row.id
       and f.filler_id = contract_row.creator_id;

    select coalesce(sum(f.amount), 0) into total_external
      from public.fills f
     where f.contract_id = contract_row.id
       and f.filler_id is distinct from contract_row.creator_id;

    if contract_row.position = v_winning_side then
      win_amount := self_fill_amount + total_external;
      if win_amount > 0 then
        update public.users
           set wallet_balance = coalesce(wallet_balance, 0) + win_amount
         where id = contract_row.creator_id;
      end if;
    else
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

      if self_fill_amount > 0 then
        if filler_odds > 0 then
          unmatched := greatest(0, self_fill_amount - total_external * creator_odds / filler_odds);
        else
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

  -- ── Notify every participant of the outcome (skipping the settler) ───────
  foreach participant_id in array participants
  loop
    if participant_id is null or participant_id = actor then
      continue;
    end if;

    select exists (
      select 1
        from public.fills f
        join public.contracts c on c.id = f.contract_id
       where c.bet_id = target_bet_id
         and f.filler_id = participant_id
         and (
           case when f.filler_id = c.creator_id
                then c.position
                else case when c.position = 'YES' then 'NO' else 'YES' end
           end
         ) = v_winning_side
    ) into participant_won;

    insert into public.notifications (user_id, type, actor_id, reference_id, reference_type)
    values (
      participant_id,
      case when participant_won then 'bet_won' else 'bet_lost' end,
      actor,
      target_bet_id,
      'bet'
    );
  end loop;

  update public.bets
     set status       = 'settled',
         is_concluded = true,
         winning_side = v_winning_side,
         settled_at   = now()
   where id = target_bet_id;
end;
$$;

grant execute on function public.settle_bet(uuid, text) to authenticated;
