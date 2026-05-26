-- 008_group_chat_triggers_and_realtime.sql
--
-- Three things in this migration:
--   1. Make (conversation_id, user_id) unique on conversation_participants so
--      we never double-add a member, and so the group-member trigger can
--      safely run on every insert without dupes.
--   2. Trigger: AFTER INSERT on groups creates the backing conversation.
--   3. Trigger: AFTER INSERT on group_members adds the user to that group's
--      conversation as a participant.
--   4. Backfill: create missing conversations for existing groups, and add
--      missing participants for existing memberships.
--   5. Add `messages` to the supabase_realtime publication so the chat
--      subscription delivers INSERTs to open clients.

-- 1. Unique (conversation_id, user_id)
alter table public.conversation_participants
  drop constraint if exists conversation_participants_conv_user_unique;
alter table public.conversation_participants
  add  constraint conversation_participants_conv_user_unique
  unique (conversation_id, user_id);

-- 2. Auto-create a conversation when a group is created.
create or replace function public.create_group_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversations (type, group_id)
  values ('group', new.id);
  return new;
end;
$$;

drop trigger if exists trg_create_group_conversation on public.groups;
create trigger trg_create_group_conversation
  after insert on public.groups
  for each row execute function public.create_group_conversation();

-- 3. Auto-add a member to the group's conversation when they join.
create or replace function public.add_group_member_to_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.conversation_participants (conversation_id, user_id)
  select c.id, new.user_id
  from public.conversations c
  where c.group_id = new.group_id
  on conflict (conversation_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_add_group_member_to_conversation on public.group_members;
create trigger trg_add_group_member_to_conversation
  after insert on public.group_members
  for each row execute function public.add_group_member_to_conversation();

-- 4a. Backfill: create conversations for any existing groups that don't have one.
insert into public.conversations (type, group_id)
select 'group', g.id
from public.groups g
where not exists (
  select 1 from public.conversations c where c.group_id = g.id
);

-- 4b. Backfill: add missing participants for existing memberships.
insert into public.conversation_participants (conversation_id, user_id)
select c.id, gm.user_id
from public.group_members gm
join public.conversations c on c.group_id = gm.group_id
where gm.user_id is not null
on conflict (conversation_id, user_id) do nothing;

-- 5. Realtime: ensure `messages` is published so postgres_changes INSERT
--    events reach the open chat client.
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    create publication supabase_realtime;
  end if;
end $$;

alter publication supabase_realtime add table public.messages;
