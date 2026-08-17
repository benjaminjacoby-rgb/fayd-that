-- 021_group_join_approval.sql
--
-- Reconciles migration history with the live database.
--
-- The group join-request flow (user submits a join code → group admin approves)
-- was built directly against the live database and never captured as a
-- migration. A `supabase db dump --linked` on 2026-08-17 confirmed five objects
-- that nothing in this folder creates:
--
--   * group_members.status ('active' | 'pending')
--   * index group_members_group_status_idx (group_id, status)
--   * policy group_members_insert_pending_self
--   * policy group_members_update_admin
--   * policy groups_update_admin
--
-- src/lib/data/groupsClient.ts (requestJoinGroup / approveJoinRequest /
-- rejectJoinRequest) and src/app/groups/[id]/page.tsx:128 all read this column,
-- so a database rebuilt from migrations alone breaks group joins outright with
-- "column status does not exist".
--
-- Everything below is written to be a no-op against the live database (which
-- already has all five objects) and to create them correctly on a fresh one.
-- Definitions are transcribed from the live dump so the two stay byte-equivalent.

-- ────────────────────────────────────────────────
-- 1. group_members.status
-- ────────────────────────────────────────────────
alter table public.group_members
  add column if not exists status text not null default 'active';

alter table public.group_members drop constraint if exists group_members_status_check;
alter table public.group_members
  add constraint group_members_status_check
  check (status in ('active','pending'));

create index if not exists group_members_group_status_idx
  on public.group_members (group_id, status);

-- ────────────────────────────────────────────────
-- 2. Policies
-- ────────────────────────────────────────────────
-- Self-service join request: you may insert *yourself*, and only as 'pending'.
-- (The unrestricted "insert self" policy from 002 is what currently lets this
-- be bypassed with status='active'; that is dealt with in 023, not here —
-- this migration only records what is already live.)
drop policy if exists "group_members_insert_pending_self" on public.group_members;
create policy "group_members_insert_pending_self"
  on public.group_members for insert
  to authenticated
  with check (auth.uid() = user_id and status = 'pending');

-- Group admin may update membership rows in their own group (approve flow).
drop policy if exists "group_members_update_admin" on public.group_members;
create policy "group_members_update_admin"
  on public.group_members for update
  to authenticated
  using (
    exists (
      select 1 from public.groups g
       where g.id = group_members.group_id
         and g.admin_id = auth.uid()
    )
  );

-- Group admin may update their own group row (rename, transfer admin via
-- transferGroupAdmin). WITH CHECK (true) is transcribed as-is from live: the
-- admin is trusted with every column on their own group, including handing
-- admin_id to someone else.
drop policy if exists "groups_update_admin" on public.groups;
create policy "groups_update_admin"
  on public.groups for update
  to authenticated
  using (admin_id = auth.uid())
  with check (true);
