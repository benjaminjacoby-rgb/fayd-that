-- BetME initial schema
-- Apply with: supabase db push, or paste into the Supabase SQL editor.

create extension if not exists "uuid-ossp";

-- ────────────────────────────────────────────────
-- Enums
-- ────────────────────────────────────────────────
create type bet_category   as enum ('fitness','academics','social','finance','other');
create type bet_status     as enum ('open','locked','resolved','disputed','cancelled');
create type bet_scope      as enum ('friends','group','geo');
create type bet_side       as enum ('yes','no');
create type bet_outcome    as enum ('win','lose');
create type mediation_status as enum ('pending','ruling_submitted','complete');

-- ────────────────────────────────────────────────
-- users (1-1 with auth.users)
-- ────────────────────────────────────────────────
create table public.users (
  id                   uuid primary key references auth.users(id) on delete cascade,
  phone                text not null,
  username             text unique,
  first_name           text,
  last_name_initial    text,
  avatar_color         text not null default 'teal',
  stripe_customer_id   text,
  wallet_balance_cents integer not null default 0,
  created_at           timestamptz not null default now()
);
create index users_username_idx on public.users (lower(username));
create index users_phone_idx    on public.users (phone);

-- ────────────────────────────────────────────────
-- friendships
-- ────────────────────────────────────────────────
create table public.friendships (
  id            uuid primary key default uuid_generate_v4(),
  requester_id  uuid not null references public.users(id) on delete cascade,
  addressee_id  uuid not null references public.users(id) on delete cascade,
  status        text not null check (status in ('pending','accepted')),
  created_at    timestamptz not null default now(),
  unique (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);

-- ────────────────────────────────────────────────
-- groups
-- ────────────────────────────────────────────────
create table public.groups (
  id           uuid primary key default uuid_generate_v4(),
  name         text not null,
  invite_code  text unique not null,
  admin_id     uuid not null references public.users(id) on delete restrict,
  created_at   timestamptz not null default now()
);

create table public.group_members (
  id         uuid primary key default uuid_generate_v4(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid not null references public.users(id) on delete cascade,
  joined_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

-- ────────────────────────────────────────────────
-- bets
-- ────────────────────────────────────────────────
create table public.bets (
  id                 uuid primary key default uuid_generate_v4(),
  creator_id         uuid not null references public.users(id) on delete restrict,
  question           text not null,
  category           bet_category not null default 'other',
  yes_probability    smallint not null check (yes_probability between 5 and 95),
  stake_cents        integer not null check (stake_cents > 0),
  expiry_at          timestamptz not null,
  resolution_notes   text,
  status             bet_status not null default 'open',
  scope              bet_scope not null default 'friends',
  group_id           uuid references public.groups(id) on delete set null,
  geo_lat            double precision,
  geo_lng            double precision,
  geo_radius_meters  integer,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);
create index bets_creator_idx on public.bets (creator_id);
create index bets_status_idx  on public.bets (status);
create index bets_group_idx   on public.bets (group_id);

create table public.bet_participants (
  id                        uuid primary key default uuid_generate_v4(),
  bet_id                    uuid not null references public.bets(id) on delete cascade,
  user_id                   uuid not null references public.users(id) on delete cascade,
  side                      bet_side not null,
  stake_cents               integer not null check (stake_cents > 0),
  stripe_payment_intent_id  text,
  paid_at                   timestamptz,
  outcome                   bet_outcome,
  unique (bet_id, user_id)
);
create index bet_participants_bet_idx  on public.bet_participants (bet_id);
create index bet_participants_user_idx on public.bet_participants (user_id);

create table public.bet_votes (
  id               uuid primary key default uuid_generate_v4(),
  bet_id           uuid not null references public.bets(id) on delete cascade,
  user_id          uuid not null references public.users(id) on delete cascade,
  yes_probability  smallint not null check (yes_probability between 0 and 100),
  created_at       timestamptz not null default now(),
  unique (bet_id, user_id)
);

-- ────────────────────────────────────────────────
-- mediations
-- ────────────────────────────────────────────────
create table public.mediations (
  id           uuid primary key default uuid_generate_v4(),
  bet_id       uuid not null references public.bets(id) on delete cascade,
  mediator_id  uuid not null references public.users(id) on delete restrict,
  status       mediation_status not null default 'pending',
  ruling       bet_side,
  fee_cents    integer not null default 0,
  created_at   timestamptz not null default now()
);

-- ────────────────────────────────────────────────
-- notifications
-- ────────────────────────────────────────────────
create table public.notifications (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references public.users(id) on delete cascade,
  type        text not null,
  payload     jsonb not null default '{}'::jsonb,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, read, created_at desc);

-- ────────────────────────────────────────────────
-- Helper: generate a 6-char invite code (uppercase, unambiguous)
-- ────────────────────────────────────────────────
create or replace function public.gen_invite_code() returns text
language sql volatile as $$
  select string_agg(
    substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', ceil(random()*32)::int, 1),
    ''
  )
  from generate_series(1, 6);
$$;

-- ────────────────────────────────────────────────
-- RLS — permissive scaffolding. Tighten before Phase 2 launch.
-- ────────────────────────────────────────────────
alter table public.users             enable row level security;
alter table public.friendships       enable row level security;
alter table public.groups            enable row level security;
alter table public.group_members     enable row level security;
alter table public.bets              enable row level security;
alter table public.bet_participants  enable row level security;
alter table public.bet_votes         enable row level security;
alter table public.mediations        enable row level security;
alter table public.notifications     enable row level security;

-- users
create policy users_self_read on public.users
  for select using (auth.uid() = id);
create policy users_friend_read on public.users
  for select using (
    exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = users.id)
          or (f.addressee_id = auth.uid() and f.requester_id = users.id))
    )
    or exists (
      select 1
      from public.group_members gm1
      join public.group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid() and gm2.user_id = users.id
    )
  );
create policy users_self_insert on public.users
  for insert with check (auth.uid() = id);
create policy users_self_update on public.users
  for update using (auth.uid() = id);

-- friendships
create policy friendships_visible on public.friendships
  for select using (auth.uid() in (requester_id, addressee_id));
create policy friendships_insert on public.friendships
  for insert with check (auth.uid() = requester_id);
create policy friendships_update on public.friendships
  for update using (auth.uid() = addressee_id);

-- groups
create policy groups_member_read on public.groups
  for select using (
    exists (select 1 from public.group_members gm where gm.group_id = groups.id and gm.user_id = auth.uid())
  );
create policy groups_insert on public.groups
  for insert with check (auth.uid() = admin_id);
create policy groups_admin_update on public.groups
  for update using (auth.uid() = admin_id);

create policy group_members_visible on public.group_members
  for select using (
    exists (select 1 from public.group_members gm where gm.group_id = group_members.group_id and gm.user_id = auth.uid())
  );
create policy group_members_self_join on public.group_members
  for insert with check (auth.uid() = user_id);

-- bets
create policy bets_creator_read on public.bets
  for select using (creator_id = auth.uid());
create policy bets_participant_read on public.bets
  for select using (
    exists (select 1 from public.bet_participants bp where bp.bet_id = bets.id and bp.user_id = auth.uid())
  );
create policy bets_friend_read on public.bets
  for select using (
    scope = 'friends' and exists (
      select 1 from public.friendships f
      where f.status = 'accepted'
        and ((f.requester_id = auth.uid() and f.addressee_id = bets.creator_id)
          or (f.addressee_id = auth.uid() and f.requester_id = bets.creator_id))
    )
  );
create policy bets_group_read on public.bets
  for select using (
    scope = 'group' and group_id is not null and exists (
      select 1 from public.group_members gm where gm.group_id = bets.group_id and gm.user_id = auth.uid()
    )
  );
create policy bets_geo_read on public.bets
  for select using (scope = 'geo');
create policy bets_create on public.bets
  for insert with check (creator_id = auth.uid());
create policy bets_creator_update on public.bets
  for update using (creator_id = auth.uid());

-- bet_participants
create policy bp_self_read on public.bet_participants
  for select using (user_id = auth.uid());
create policy bp_creator_read on public.bet_participants
  for select using (
    exists (select 1 from public.bets b where b.id = bet_participants.bet_id and b.creator_id = auth.uid())
  );
create policy bp_self_insert on public.bet_participants
  for insert with check (user_id = auth.uid());
create policy bp_self_update on public.bet_participants
  for update using (user_id = auth.uid());

-- bet_votes
create policy votes_self_all on public.bet_votes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- mediations
create policy mediations_party_read on public.mediations
  for select using (
    mediator_id = auth.uid()
    or exists (select 1 from public.bets b where b.id = mediations.bet_id and b.creator_id = auth.uid())
    or exists (select 1 from public.bet_participants bp where bp.bet_id = mediations.bet_id and bp.user_id = auth.uid())
  );
create policy mediations_insert on public.mediations
  for insert with check (true);
create policy mediations_update on public.mediations
  for update using (mediator_id = auth.uid());

-- notifications
create policy notifications_own_read on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_own_update on public.notifications
  for update using (user_id = auth.uid());
