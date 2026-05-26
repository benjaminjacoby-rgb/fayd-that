-- 010_notifications_actor_and_settle_fanout.sql
--
-- 1. Add `actor_id` to notifications. The original schema only modelled the
--    recipient (`user_id`) and a reference handle (`reference_id` +
--    `reference_type`). With only those two fields the only way the UI could
--    figure out who *did* the thing was to join through the reference, which
--    works for friend_request (requester sits on the friendship row) but
--    doesn't generalise to bet_filled, bet_won, bet_commented, etc. Storing
--    the actor explicitly removes the need for one custom join per type.
--
-- 2. Backfill `actor_id` on the two existing notification types so the bell
--    keeps rendering names + avatars for older rows.
--
-- 3. Patch `settle_bet` to fan out `bet_won` / `bet_lost` notifications to
--    every participant (skipping the actor — no self-notifications).

-- 1. Column + index
alter table public.notifications
  add column if not exists actor_id uuid references public.users(id) on delete set null;

create index if not exists notifications_actor_id_idx
  on public.notifications (actor_id);

-- 2. Backfill from friendships (legacy rows that pre-date this migration).
update public.notifications n
   set actor_id = f.requester_id
  from public.friendships f
 where n.type = 'friend_request'
   and n.reference_type = 'friendship'
   and n.reference_id = f.id
   and n.actor_id is null;

update public.notifications n
   set actor_id = f.addressee_id
  from public.friendships f
 where n.type = 'friend_request_accepted'
   and n.reference_type = 'friendship'
   and n.reference_id = f.id
   and n.actor_id is null;

-- 3. settle_bet now also writes one bet_won/bet_lost row per participant.
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
  effective_mediator uuid;
  participants       uuid[];
  participant_count  int;
  agree_count        int;
  needed             int;
  fill_row           record;
  side_for_fill      text;
  their_odds         numeric;
  win_amount         numeric;
  participant_id     uuid;
  participant_won    boolean;
  actor              uuid := auth.uid();
begin
  if winning_side not in ('YES','NO') then
    raise exception 'invalid winning_side: %', winning_side;
  end if;

  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.status = 'settled' or bet_row.is_concluded then
    raise exception 'bet already resolved';
  end if;

  -- Self-mediation: poster IS the mediator even though mediator_id is null.
  if bet_row.mediator_type = 'self' then
    effective_mediator := bet_row.poster_id;
  elsif bet_row.mediator_type = 'requested' and bet_row.mediator_id is not null then
    effective_mediator := bet_row.mediator_id;
  else
    effective_mediator := null;
  end if;

  -- Participants: poster + sub-contract creators + counter-party fillers.
  select coalesce(array_agg(distinct user_id), array[]::uuid[]) into participants
  from (
    select bet_row.poster_id as user_id where bet_row.poster_id is not null
    union
    select c.creator_id
      from public.contracts c
     where c.bet_id = target_bet_id and c.creator_id is not null
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
    if actor <> effective_mediator then
      raise exception 'only the assigned mediator can settle this bet';
    end if;
  else
    if not (actor = any(participants)) then
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

  -- Pay winners.
  for fill_row in
    select f.amount, f.filler_id, c.creator_id, c.position, c.odds
      from public.fills f
      join public.contracts c on c.id = f.contract_id
     where c.bet_id = target_bet_id and f.filler_id is not null
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

  -- Notify every participant of the outcome (skipping the settler themselves).
  foreach participant_id in array participants
  loop
    if participant_id is null or participant_id = actor then
      continue;
    end if;
    -- "Won" iff this participant has any fill whose effective side matches
    -- the winning side. Posters/sub-contract creators always have at least
    -- one self-fill, so this is the same lookup for everyone.
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
         ) = winning_side
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
     set status = 'settled', is_concluded = true
   where id = target_bet_id;
end;
$$;

grant execute on function public.settle_bet(uuid, text) to authenticated;
