-- Phase 2 — negotiations + contracts + group join approvals.
-- Apply AFTER 0001_initial_schema.sql.

-- ────────────────────────────────────────────────
-- Enums
-- ────────────────────────────────────────────────
create type negotiation_status as enum ('open','accepted','countered','cancelled');
create type contract_status    as enum ('active','resolved');
create type group_member_status as enum ('active','pending');

-- ────────────────────────────────────────────────
-- Extend group_members with an approval status.
-- Existing rows are treated as already-approved members.
-- ────────────────────────────────────────────────
alter table public.group_members
  add column status group_member_status not null default 'active';

-- ────────────────────────────────────────────────
-- negotiations — public offers/counter-offers under a bet.
-- ────────────────────────────────────────────────
create table public.negotiations (
  id                       uuid primary key default uuid_generate_v4(),
  bet_id                   uuid not null references public.bets(id) on delete cascade,
  proposer_id              uuid not null references public.users(id) on delete cascade,
  proposed_yes_probability smallint not null check (proposed_yes_probability between 0 and 100),
  stake_tier_cents         integer not null check (stake_tier_cents in (500, 1000, 2500, 5000, 10000)),
  status                   negotiation_status not null default 'open',
  parent_negotiation_id    uuid references public.negotiations(id) on delete set null,
  created_at               timestamptz not null default now()
);
create index negotiations_bet_idx        on public.negotiations (bet_id, status, created_at desc);
create index negotiations_proposer_idx   on public.negotiations (proposer_id);

-- ────────────────────────────────────────────────
-- contracts — accepted YES/NO pairings; the unit of money at risk.
-- ────────────────────────────────────────────────
create table public.contracts (
  id              uuid primary key default uuid_generate_v4(),
  bet_id          uuid not null references public.bets(id) on delete cascade,
  yes_user_id     uuid not null references public.users(id) on delete restrict,
  no_user_id      uuid not null references public.users(id) on delete restrict,
  yes_probability smallint not null check (yes_probability between 0 and 100),
  stake_cents     integer not null check (stake_cents > 0),
  negotiation_id  uuid references public.negotiations(id) on delete set null,
  status          contract_status not null default 'active',
  yes_outcome     bet_outcome,
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  check (yes_user_id <> no_user_id)
);
create index contracts_bet_idx on public.contracts (bet_id, status, created_at desc);
create index contracts_yes_idx on public.contracts (yes_user_id);
create index contracts_no_idx  on public.contracts (no_user_id);

-- ────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────
alter table public.negotiations enable row level security;
alter table public.contracts    enable row level security;

-- Negotiations are visible to anyone who can see the parent bet.
create policy negotiations_visible on public.negotiations
  for select using (
    exists (select 1 from public.bets b where b.id = negotiations.bet_id)
  );
create policy negotiations_insert on public.negotiations
  for insert with check (proposer_id = auth.uid());
create policy negotiations_proposer_update on public.negotiations
  for update using (proposer_id = auth.uid());

-- Contracts are visible to either party + the bet creator + group members
-- (delegated to the bets-table RLS via subquery).
create policy contracts_party_read on public.contracts
  for select using (
    yes_user_id = auth.uid()
    or no_user_id = auth.uid()
    or exists (select 1 from public.bets b where b.id = contracts.bet_id and b.creator_id = auth.uid())
    or exists (
      select 1
      from public.bets b
      join public.group_members gm on gm.group_id = b.group_id
      where b.id = contracts.bet_id
        and b.scope = 'group'
        and gm.user_id = auth.uid()
        and gm.status = 'active'
    )
  );
create policy contracts_insert on public.contracts
  for insert with check (yes_user_id = auth.uid() or no_user_id = auth.uid());
create policy contracts_party_update on public.contracts
  for update using (yes_user_id = auth.uid() or no_user_id = auth.uid());
