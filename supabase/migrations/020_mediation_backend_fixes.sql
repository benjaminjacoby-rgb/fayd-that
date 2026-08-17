-- 020_mediation_backend_fixes.sql
--
-- The mediation flow has three client-side actions performed by the
-- *mediator*, not the bet's poster: accepting an open mediator slot,
-- closing the bet, and marking it concluded. All three only ever called a
-- plain `.from("bets").update(...)`, which is gated by the `bets_update_self`
-- policy from 002 — `using (auth.uid() = poster_id)`. For a non-poster
-- mediator that condition is false, so the UPDATE silently matches zero
-- rows: Postgres/Supabase does not error on a no-op update, so the call
-- resolves "successfully" from the client's perspective while writing
-- nothing. That's why a bet you just accepted mediation on never actually
-- got your user id written to `mediator_id`, and so never showed up in your
-- mediation queue.
--
-- Also restores mediator-authorized settling for self-mediated bets:
-- 009/010 special-cased `mediator_type='self'` (mediator_id stays NULL;
-- the poster IS the mediator) via an `effective_mediator` variable, but
-- 013's rewrite of settle_bet ("corrected payout model") dropped that
-- variable entirely and never got it back in 015. Since then, a
-- self-mediating poster clicking "Confirm settle" always failed — either
-- "only the assigned mediator can settle this bet" (mediator_id is null,
-- so it fell into the vote branch) or "majority not reached" (no vote row
-- exists for a direct mediator ruling).
--
-- Fix: route all four actions (accept, close, conclude, settle) through
-- SECURITY DEFINER functions that run each specific, narrow write with
-- their own auth check — same pattern as settle_bet already used. This is
-- deliberately not a broader UPDATE policy: a policy permissive enough to
-- let a mediator flip `mediator_id`/`status` would also let them rewrite
-- any other column on that same UPDATE call, since RLS doesn't restrict
-- *which* columns changed once a row satisfies the policy — the function
-- approach only ever touches the columns hardcoded in its own UPDATE
-- statement.

-- ────────────────────────────────────────────────
-- Shared helper: who is actually mediating this bet, if anyone.
-- ────────────────────────────────────────────────
create or replace function public.bet_effective_mediator(bet_row public.bets)
returns uuid
language sql
stable
as $$
  select case
    when bet_row.mediator_type = 'self' then bet_row.poster_id
    when bet_row.mediator_type = 'requested' then bet_row.mediator_id
    else null
  end;
$$;

-- ────────────────────────────────────────────────
-- accept_mediator — volunteer claims an open "requested" mediator slot.
-- ────────────────────────────────────────────────
create or replace function public.accept_mediator(target_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bet_row public.bets%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.mediator_type <> 'requested' then
    raise exception 'this bet is not requesting a mediator';
  end if;
  if bet_row.mediator_id is not null then
    raise exception 'a mediator has already been assigned';
  end if;
  if auth.uid() = bet_row.poster_id then
    raise exception 'you cannot mediate your own bet';
  end if;

  update public.bets
     set mediator_id = auth.uid()
   where id = target_bet_id
     and mediator_type = 'requested'
     and mediator_id is null;
end;
$$;

grant execute on function public.accept_mediator(uuid) to authenticated;

-- ────────────────────────────────────────────────
-- close_bet — poster or mediator closes an open bet to new fills.
-- ────────────────────────────────────────────────
create or replace function public.close_bet(target_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bet_row public.bets%rowtype;
begin
  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.status <> 'open' then
    raise exception 'only an open bet can be closed';
  end if;
  if auth.uid() is distinct from bet_row.poster_id
     and auth.uid() is distinct from public.bet_effective_mediator(bet_row) then
    raise exception 'only the poster or mediator can close this bet';
  end if;

  update public.bets set status = 'closed' where id = target_bet_id;
end;
$$;

grant execute on function public.close_bet(uuid) to authenticated;

-- ────────────────────────────────────────────────
-- conclude_bet — poster or mediator marks the bet concluded outright
-- (separate from settle_bet's payout flow — used for "mark as concluded"
-- from the post menu, e.g. calling off a bet nobody's disputing).
-- ────────────────────────────────────────────────
create or replace function public.conclude_bet(target_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bet_row public.bets%rowtype;
begin
  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.is_concluded or bet_row.status = 'settled' then
    raise exception 'bet already resolved';
  end if;
  if auth.uid() is distinct from bet_row.poster_id
     and auth.uid() is distinct from public.bet_effective_mediator(bet_row) then
    raise exception 'only the poster or mediator can conclude this bet';
  end if;

  update public.bets set status = 'concluded', is_concluded = true where id = target_bet_id;
end;
$$;

grant execute on function public.conclude_bet(uuid) to authenticated;

-- ────────────────────────────────────────────────
-- settle_bet — re-created once more (supersedes 015) purely to restore the
-- effective-mediator resolution that 013 dropped. Payout math and
-- settled_at are unchanged from 015.
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

  update public.bets
     set status       = 'settled',
         is_concluded = true,
         winning_side = v_winning_side,
         settled_at   = now()
   where id = target_bet_id;
end;
$$;

grant execute on function public.settle_bet(uuid, text) to authenticated;
