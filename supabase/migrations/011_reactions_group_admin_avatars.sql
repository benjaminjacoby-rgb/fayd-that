-- 011_reactions_group_admin_avatars.sql
--
-- 1. bet_reactions table — emoji reactions on bet cards. One row per
--    (bet, user, emoji); the unique constraint enforces "a user can only have
--    one of each emoji per bet" so toggling becomes insert/delete with no
--    extra bookkeeping.
-- 2. group_members RLS — let group admins add and remove other members
--    (previously only "insert self" was allowed, which made the admin-driven
--    member-management flow impossible).
-- 3. Trigger that mirrors group_members deletions into
--    conversation_participants, so removing someone from a group also kicks
--    them out of the group chat (the inverse of the trigger added in 008).
-- 4. Storage bucket + policies for profile photos.

-- ────────────────────────────────────────────────
-- 1. bet_reactions
-- ────────────────────────────────────────────────
create table if not exists public.bet_reactions (
  id          uuid primary key default gen_random_uuid(),
  bet_id      uuid not null references public.bets(id) on delete cascade,
  user_id     uuid not null references public.users(id) on delete cascade,
  emoji       text not null,
  created_at  timestamptz not null default now(),
  unique (bet_id, user_id, emoji)
);
create index if not exists bet_reactions_bet_id_idx  on public.bet_reactions (bet_id);
create index if not exists bet_reactions_user_id_idx on public.bet_reactions (user_id);

alter table public.bet_reactions enable row level security;

drop policy if exists "bet_reactions_select_authenticated" on public.bet_reactions;
create policy "bet_reactions_select_authenticated"
  on public.bet_reactions for select
  to authenticated
  using (true);

drop policy if exists "bet_reactions_insert_self" on public.bet_reactions;
create policy "bet_reactions_insert_self"
  on public.bet_reactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "bet_reactions_delete_self" on public.bet_reactions;
create policy "bet_reactions_delete_self"
  on public.bet_reactions for delete
  to authenticated
  using (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- 2. group_members admin policies
-- ────────────────────────────────────────────────
-- Admin can add any member to their group (in addition to the existing
-- "insert self" for join-flow).
drop policy if exists "group_members_insert_admin" on public.group_members;
create policy "group_members_insert_admin"
  on public.group_members for insert
  to authenticated
  with check (
    exists (
      select 1 from public.groups g
       where g.id = group_members.group_id
         and g.admin_id = auth.uid()
    )
  );

-- Delete: self can leave, admin can remove anyone in their group.
drop policy if exists "group_members_delete_self_or_admin" on public.group_members;
create policy "group_members_delete_self_or_admin"
  on public.group_members for delete
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.groups g
       where g.id = group_members.group_id
         and g.admin_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────
-- 3. Member-removal trigger — mirrors the add-trigger from migration 008.
-- ────────────────────────────────────────────────
create or replace function public.remove_group_member_from_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.conversation_participants cp
   using public.conversations c
   where c.id = cp.conversation_id
     and c.group_id = old.group_id
     and cp.user_id = old.user_id;
  return old;
end;
$$;

drop trigger if exists trg_remove_group_member_from_conversation on public.group_members;
create trigger trg_remove_group_member_from_conversation
  after delete on public.group_members
  for each row execute function public.remove_group_member_from_conversation();

-- ────────────────────────────────────────────────
-- 4. Avatars bucket + policies
-- ────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read so <img src> works without signed URLs.
drop policy if exists "avatars_select_public" on storage.objects;
create policy "avatars_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'avatars');

-- Each user can only write under a folder named with their own uid, which
-- prevents one user from overwriting someone else's avatar.
drop policy if exists "avatars_insert_self" on storage.objects;
create policy "avatars_insert_self"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_self" on storage.objects;
create policy "avatars_update_self"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_self" on storage.objects;
create policy "avatars_delete_self"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
