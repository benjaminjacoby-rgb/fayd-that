-- 004_conversation_insert_policies.sql
--
-- Adds the missing INSERT policies for `conversations` and
-- `conversation_participants`. Without these, every call from the client to
-- start a new DM fails with an RLS error ("new row violates row-level security
-- policy"), which the UI surfaces as "Couldn't start conversation".
--
-- The model is intentionally permissive (any authenticated user may create a
-- conversation and add participants), matching the existing loose policies on
-- friendships / group_members. Tighten later if needed.

create policy "conversations_insert_authenticated"
  on public.conversations for insert
  to authenticated
  with check (true);

create policy "conversation_participants_insert_authenticated"
  on public.conversation_participants for insert
  to authenticated
  with check (true);
