-- Fayd initial schema.
-- Apply via `supabase db push` or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ────────────────────────────────────────────────
-- users (extends auth.users)
-- ────────────────────────────────────────────────
create table public.users (
  id              uuid primary key references auth.users(id) on delete cascade,
  username        text unique not null,
  full_name       text,
  phone_number    text unique,
  avatar_url      text,
  wallet_balance  numeric not null default 0,
  created_at      timestamptz not null default now()
);

-- ────────────────────────────────────────────────
-- groups
-- ────────────────────────────────────────────────
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  join_code   text unique not null,
  admin_id    uuid references public.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
create index groups_admin_id_idx on public.groups (admin_id);

create table public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid references public.groups(id) on delete cascade,
  user_id    uuid references public.users(id) on delete cascade,
  role       text not null default 'member' check (role in ('admin','member')),
  joined_at  timestamptz not null default now()
);
create index group_members_group_id_idx on public.group_members (group_id);
create index group_members_user_id_idx  on public.group_members (user_id);

-- ────────────────────────────────────────────────
-- bets
-- ────────────────────────────────────────────────
create table public.bets (
  id              uuid primary key default gen_random_uuid(),
  poster_id       uuid references public.users(id) on delete set null,
  question        text not null,
  poster_position text check (poster_position in ('YES','NO')),
  stake_amount    numeric not null,
  audience_type   text check (audience_type in ('friends','group','specific_friends')),
  group_id        uuid references public.groups(id) on delete set null,
  end_date        timestamptz,
  is_concluded    boolean not null default false,
  mediator_type   text not null default 'none' check (mediator_type in ('none','self','requested')),
  mediator_id     uuid references public.users(id) on delete set null,
  status          text not null default 'open' check (status in ('open','filled','concluded')),
  created_at      timestamptz not null default now()
);
create index bets_poster_id_idx   on public.bets (poster_id);
create index bets_group_id_idx    on public.bets (group_id);
create index bets_mediator_id_idx on public.bets (mediator_id);
create index bets_created_at_idx  on public.bets (created_at desc);

-- ────────────────────────────────────────────────
-- contracts
-- ────────────────────────────────────────────────
create table public.contracts (
  id                uuid primary key default gen_random_uuid(),
  bet_id            uuid references public.bets(id) on delete cascade,
  creator_id        uuid references public.users(id) on delete set null,
  position          text check (position in ('YES','NO')),
  odds              numeric not null,
  stake_amount      numeric not null,
  amount_remaining  numeric not null,
  is_filled         boolean not null default false,
  created_at        timestamptz not null default now()
);
create index contracts_bet_id_idx     on public.contracts (bet_id);
create index contracts_creator_id_idx on public.contracts (creator_id);

-- ────────────────────────────────────────────────
-- fills
-- ────────────────────────────────────────────────
create table public.fills (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid references public.contracts(id) on delete cascade,
  filler_id    uuid references public.users(id) on delete set null,
  amount       numeric not null,
  created_at   timestamptz not null default now()
);
create index fills_contract_id_idx on public.fills (contract_id);
create index fills_filler_id_idx   on public.fills (filler_id);

-- ────────────────────────────────────────────────
-- friendships
-- ────────────────────────────────────────────────
create table public.friendships (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid references public.users(id) on delete cascade,
  addressee_id  uuid references public.users(id) on delete cascade,
  status        text not null default 'pending' check (status in ('pending','accepted')),
  created_at    timestamptz not null default now()
);
create index friendships_requester_id_idx on public.friendships (requester_id);
create index friendships_addressee_id_idx on public.friendships (addressee_id);

-- ────────────────────────────────────────────────
-- conversations
-- ────────────────────────────────────────────────
create table public.conversations (
  id          uuid primary key default gen_random_uuid(),
  type        text check (type in ('direct','group')),
  group_id    uuid references public.groups(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index conversations_group_id_idx on public.conversations (group_id);

create table public.conversation_participants (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.conversations(id) on delete cascade,
  user_id          uuid references public.users(id) on delete cascade
);
create index conv_participants_conv_id_idx on public.conversation_participants (conversation_id);
create index conv_participants_user_id_idx on public.conversation_participants (user_id);

-- ────────────────────────────────────────────────
-- messages
-- ────────────────────────────────────────────────
create table public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.conversations(id) on delete cascade,
  sender_id        uuid references public.users(id) on delete set null,
  content          text,
  bet_id           uuid references public.bets(id) on delete set null,
  created_at       timestamptz not null default now()
);
create index messages_conversation_id_idx on public.messages (conversation_id);
create index messages_sender_id_idx       on public.messages (sender_id);
create index messages_bet_id_idx          on public.messages (bet_id);
create index messages_created_at_idx      on public.messages (created_at desc);

-- ────────────────────────────────────────────────
-- votes
-- ────────────────────────────────────────────────
create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  bet_id      uuid references public.bets(id) on delete cascade,
  voter_id    uuid references public.users(id) on delete cascade,
  vote        text check (vote in ('YES','NO')),
  created_at  timestamptz not null default now()
);
create index votes_bet_id_idx   on public.votes (bet_id);
create index votes_voter_id_idx on public.votes (voter_id);

-- ────────────────────────────────────────────────
-- notifications
-- ────────────────────────────────────────────────
create table public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references public.users(id) on delete cascade,
  type            text not null,
  reference_id    uuid,
  reference_type  text,
  is_read         boolean not null default false,
  created_at      timestamptz not null default now()
);
create index notifications_user_id_idx on public.notifications (user_id);

-- ────────────────────────────────────────────────
-- Enable RLS on every table. Policies will be added in a later migration.
-- ────────────────────────────────────────────────
alter table public.users                     enable row level security;
alter table public.groups                    enable row level security;
alter table public.group_members             enable row level security;
alter table public.bets                      enable row level security;
alter table public.contracts                 enable row level security;
alter table public.fills                     enable row level security;
alter table public.friendships               enable row level security;
alter table public.conversations             enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.messages                  enable row level security;
alter table public.votes                     enable row level security;
alter table public.notifications             enable row level security;
