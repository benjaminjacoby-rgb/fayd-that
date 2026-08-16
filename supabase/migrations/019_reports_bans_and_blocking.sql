-- 019_reports_bans_and_blocking.sql
--
-- Three moderation features:
--
-- 1. Reporting — `reports` table (email delivery happens in the app layer;
--    this table is the durable record the admin dashboard reads). Admin
--    access is driven by `is_admin()`, a SECURITY DEFINER helper matching
--    the signed-in user's phone number against `admin_phone_numbers`
--    (digit-normalized so formatting differences don't matter), rather than
--    a hardcoded id — works regardless of signup order. Same technique as
--    `user_can_see_bet()` in 007.
-- 2. Bet takedown — `bets.is_removed` (soft delete) settable only by admins
--    (RLS), and folded into `bets_select_visible` so removed bets vanish
--    for everyone except the admin without touching every read call site.
-- 3. Blocking — `blocked_users` + `is_blocked_pair()` (SECURITY DEFINER,
--    same reasoning as above: the restrictive select policy on
--    blocked_users only lets you read your own rows, so the *other*
--    direction of a block has to be checked through a definer function).
--    Blocking severs any existing friendship both ways and blocks future
--    requests either direction. Also folded into `bets_select_visible`.
-- 4. Banned words — `banned_words` + `contains_banned_word()` + a trigger
--    on `bets` that rejects the insert/update outright. This is
--    enforcement, not just a UI hint: it can't be bypassed by calling the
--    API directly. The app also mirrors this check client-side (same
--    word-boundary logic) purely for instant UX feedback before hitting
--    the DB.

-- ────────────────────────────────────────────────
-- 1. Admin
-- ────────────────────────────────────────────────
create table public.admin_phone_numbers (
  phone_digits  text primary key  -- last-10-digit normalized form, e.g. '2038237063'
);

insert into public.admin_phone_numbers (phone_digits) values ('2038237063')
  on conflict do nothing;

-- SECURITY DEFINER so RLS policies elsewhere can gate on "is this caller an
-- admin" without needing their own read access to admin_phone_numbers.
create or replace function public.is_admin(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.users u
      join public.admin_phone_numbers a
        on right(regexp_replace(coalesce(u.phone_number, ''), '\D', '', 'g'), 10) = a.phone_digits
     where u.id = uid
       and u.phone_number is not null
  );
$$;

grant execute on function public.is_admin(uuid) to authenticated;

-- ────────────────────────────────────────────────
-- 2. Reports
-- ────────────────────────────────────────────────
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  bet_id       uuid references public.bets(id) on delete cascade,
  reporter_id  uuid references public.users(id) on delete set null,
  reason       text not null,
  details      text,
  status       text not null default 'open' check (status in ('open', 'resolved', 'dismissed')),
  created_at   timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.users(id)
);
create index reports_bet_id_idx on public.reports (bet_id);
create index reports_status_idx on public.reports (status);

alter table public.reports enable row level security;

create policy "reports_insert_own"
  on public.reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

create policy "reports_select_admin"
  on public.reports for select
  to authenticated
  using (public.is_admin(auth.uid()));

create policy "reports_update_admin"
  on public.reports for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ────────────────────────────────────────────────
-- 3. Bet takedown
-- ────────────────────────────────────────────────
alter table public.bets
  add column if not exists is_removed boolean not null default false,
  add column if not exists removed_at timestamptz,
  add column if not exists removed_by uuid references public.users(id);

create policy "bets_update_admin"
  on public.bets for update
  to authenticated
  using (public.is_admin(auth.uid()))
  with check (public.is_admin(auth.uid()));

-- ────────────────────────────────────────────────
-- 4. Blocking
-- ────────────────────────────────────────────────
create table public.blocked_users (
  blocker_id  uuid not null references public.users(id) on delete cascade,
  blocked_id  uuid not null references public.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocked_users_blocked_id_idx on public.blocked_users (blocked_id);

alter table public.blocked_users enable row level security;

create policy "blocked_users_select_own"
  on public.blocked_users for select
  to authenticated
  using (blocker_id = auth.uid());

create policy "blocked_users_insert_own"
  on public.blocked_users for insert
  to authenticated
  with check (blocker_id = auth.uid());

create policy "blocked_users_delete_own"
  on public.blocked_users for delete
  to authenticated
  using (blocker_id = auth.uid());

create or replace function public.is_blocked_pair(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.blocked_users
     where (blocker_id = a and blocked_id = b)
        or (blocker_id = b and blocked_id = a)
  );
$$;

grant execute on function public.is_blocked_pair(uuid, uuid) to authenticated;

create or replace function public.on_block_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.friendships
   where (requester_id = new.blocker_id and addressee_id = new.blocked_id)
      or (requester_id = new.blocked_id and addressee_id = new.blocker_id);
  return new;
end;
$$;

create trigger blocked_users_sever_friendship
  after insert on public.blocked_users
  for each row execute function public.on_block_user();

-- Re-create the friendships insert policy (from 002) with a block check
-- added. Same permissive base condition, just narrowed.
drop policy if exists "friendships_insert_party" on public.friendships;
create policy "friendships_insert_party"
  on public.friendships for insert
  to authenticated
  with check (
    (auth.uid() = requester_id or auth.uid() = addressee_id)
    and not public.is_blocked_pair(requester_id, addressee_id)
  );

-- Re-gate bet visibility (supersedes the 007 policy): same
-- user_can_see_bet() check, plus hide removed bets from non-admins and hide
-- either side of a block from each other. Admins bypass all three checks —
-- reviewing a report means seeing bets outside your own audience/blocks,
-- including ones already taken down.
drop policy if exists "bets_select_visible" on public.bets;
create policy "bets_select_visible"
  on public.bets for select
  to authenticated
  using (
    public.is_admin(auth.uid())
    or (
      public.user_can_see_bet(auth.uid(), bets.id, bets.poster_id, bets.audience_type, bets.group_id)
      and not bets.is_removed
      and not public.is_blocked_pair(bets.poster_id, auth.uid())
    )
  );

-- ────────────────────────────────────────────────
-- 5. Banned words
-- ────────────────────────────────────────────────
create table public.banned_words (
  word text primary key
);

alter table public.banned_words enable row level security;

create policy "banned_words_select_authenticated"
  on public.banned_words for select
  to authenticated
  using (true);

-- Common profanity + explicitly severe terms. Not exhaustive by design —
-- add more with `insert into banned_words (word) values ('...');` any time;
-- no migration or deploy required, the trigger below re-reads the table on
-- every check.
insert into public.banned_words (word) values
  ('fuck'), ('fucker'), ('fucking'), ('motherfucker'),
  ('shit'), ('bullshit'),
  ('bitch'), ('bastard'),
  ('asshole'), ('dumbass'), ('jackass'),
  ('cunt'), ('dick'), ('dickhead'), ('cock'), ('pussy'), ('twat'), ('prick'),
  ('piss'), ('pissed'),
  ('slut'), ('whore'),
  ('wanker'), ('bollocks'), ('douchebag'),
  ('retard'), ('retarded'),
  ('rape'), ('rapist'),
  ('molest'), ('molester'),
  ('pedophile'),
  ('kys'), ('kill yourself')
on conflict do nothing;

-- \m / \M are Postgres regex word-boundary anchors (start/end of word) —
-- case-insensitive whole-word match via ~*. Loops the (small) table on each
-- call; fine at bet-post frequency.
create or replace function public.contains_banned_word(input text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w text;
begin
  if input is null then
    return false;
  end if;
  for w in select word from public.banned_words loop
    if input ~* ('\m' || w || '\M') then
      return true;
    end if;
  end loop;
  return false;
end;
$$;

grant execute on function public.contains_banned_word(text) to authenticated;

create or replace function public.check_bet_language()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.contains_banned_word(new.question) then
    raise exception 'This bet contains language that is not allowed.';
  end if;
  return new;
end;
$$;

create trigger bets_check_language
  before insert or update of question on public.bets
  for each row execute function public.check_bet_language();
