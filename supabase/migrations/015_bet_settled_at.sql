-- 015_bet_settled_at.sql
--
-- Adds bets.settled_at so the history tab can show "date resolved".
-- Also re-creates settle_bet with settled_at = now() in the final update
-- (supersedes the version in 013).

alter table public.bets
  add column if not exists settled_at timestamptz;

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

  update public.bets
     set status       = 'settled',
         is_concluded = true,
         winning_side = v_winning_side,
         settled_at   = now()
   where id = target_bet_id;
end;
$$;

grant execute on function public.settle_bet(uuid, text) to authenticated;
