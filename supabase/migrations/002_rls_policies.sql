-- Fayd RLS policies.
-- Apply via `supabase db push` or paste into the Supabase SQL editor.
-- All tables had RLS enabled in 001_initial_schema.sql; without policies,
-- queries return no rows even to authenticated users.

-- ────────────────────────────────────────────────
-- users
-- ────────────────────────────────────────────────
create policy "users_select_authenticated"
  on public.users for select
  to authenticated
  using (true);

create policy "users_update_self"
  on public.users for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "users_insert_self"
  on public.users for insert
  to authenticated
  with check (auth.uid() = id);

-- ────────────────────────────────────────────────
-- bets
-- ────────────────────────────────────────────────
create policy "bets_select_authenticated"
  on public.bets for select
  to authenticated
  using (true);

create policy "bets_insert_self"
  on public.bets for insert
  to authenticated
  with check (auth.uid() = poster_id);

create policy "bets_update_self"
  on public.bets for update
  to authenticated
  using (auth.uid() = poster_id)
  with check (auth.uid() = poster_id);

-- ────────────────────────────────────────────────
-- contracts
-- ────────────────────────────────────────────────
create policy "contracts_select_authenticated"
  on public.contracts for select
  to authenticated
  using (true);

create policy "contracts_insert_self"
  on public.contracts for insert
  to authenticated
  with check (auth.uid() = creator_id);

create policy "contracts_update_self"
  on public.contracts for update
  to authenticated
  using (auth.uid() = creator_id)
  with check (auth.uid() = creator_id);

-- ────────────────────────────────────────────────
-- fills
-- ────────────────────────────────────────────────
create policy "fills_select_authenticated"
  on public.fills for select
  to authenticated
  using (true);

create policy "fills_insert_self"
  on public.fills for insert
  to authenticated
  with check (auth.uid() = filler_id);

-- ────────────────────────────────────────────────
-- groups
-- ────────────────────────────────────────────────
create policy "groups_select_authenticated"
  on public.groups for select
  to authenticated
  using (true);

create policy "groups_insert_authenticated"
  on public.groups for insert
  to authenticated
  with check (true);

-- ────────────────────────────────────────────────
-- group_members
-- ────────────────────────────────────────────────
create policy "group_members_select_authenticated"
  on public.group_members for select
  to authenticated
  using (true);

create policy "group_members_insert_self"
  on public.group_members for insert
  to authenticated
  with check (auth.uid() = user_id);

-- ────────────────────────────────────────────────
-- friendships
-- ────────────────────────────────────────────────
create policy "friendships_select_authenticated"
  on public.friendships for select
  to authenticated
  using (true);

create policy "friendships_insert_party"
  on public.friendships for insert
  to authenticated
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "friendships_update_party"
  on public.friendships for update
  to authenticated
  using (auth.uid() = requester_id or auth.uid() = addressee_id)
  with check (auth.uid() = requester_id or auth.uid() = addressee_id);

-- ────────────────────────────────────────────────
-- conversations
-- ────────────────────────────────────────────────
create policy "conversations_select_participant"
  on public.conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = conversations.id
        and cp.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────
-- conversation_participants
-- ────────────────────────────────────────────────
create policy "conversation_participants_select_authenticated"
  on public.conversation_participants for select
  to authenticated
  using (true);

-- ────────────────────────────────────────────────
-- messages
-- ────────────────────────────────────────────────
create policy "messages_select_participant"
  on public.messages for select
  to authenticated
  using (
    exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );

create policy "messages_insert_self"
  on public.messages for insert
  to authenticated
  with check (
    auth.uid() = sender_id
    and exists (
      select 1 from public.conversation_participants cp
      where cp.conversation_id = messages.conversation_id
        and cp.user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────
-- votes
-- ────────────────────────────────────────────────
create policy "votes_select_authenticated"
  on public.votes for select
  to authenticated
  using (true);

create policy "votes_insert_self"
  on public.votes for insert
  to authenticated
  with check (auth.uid() = voter_id);

-- ────────────────────────────────────────────────
-- notifications
-- ────────────────────────────────────────────────
create policy "notifications_select_self"
  on public.notifications for select
  to authenticated
  using (auth.uid() = user_id);

create policy "notifications_update_self"
  on public.notifications for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
