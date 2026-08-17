-- 022_rls_policy_hardening.sql
--
-- Removes five live-only RLS policies that no migration created and that the
-- application never relies on. Three of them are genuinely over-permissive, not
-- merely redundant. Verified against src/ before writing: no code path calls
-- `.update()` on `bets` for mediator actions, and no code path depends on the
-- comments policies being wider than `comments_select_bet_visible`.
--
-- ────────────────────────────────────────────────
-- 1. bets: two over-broad UPDATE policies
-- ────────────────────────────────────────────────
-- Migration 020's own header explains why these are the wrong shape: RLS
-- constrains *which rows* an UPDATE may touch, never *which columns* it
-- changed. So a policy permissive enough to let a mediator set `mediator_id`
-- or `status` also lets them rewrite `question`, `stake_amount`, `winning_side`
-- or `poster_id` on that same row.
--
-- Concretely, as live today:
--   * bets_update_accept_mediator — USING (mediator_type='requested' AND
--     mediator_id IS NULL). Any authenticated user can UPDATE any bet that is
--     currently requesting a mediator and rewrite arbitrary columns on it, so
--     long as the resulting row still has mediator_type='requested' and
--     mediator_id = themselves.
--   * bets_update_mediator — USING (mediator_id = auth.uid()). The assigned
--     mediator can set status='settled' / is_concluded / winning_side directly,
--     marking a bet resolved *without* settle_bet's payout loop ever running —
--     i.e. resolving a bet while nobody gets paid.
--
-- Neither is reachable through the app's own UI, which routes every one of
-- these actions through the narrow SECURITY DEFINER RPCs added in 020
-- (accept_mediator / close_bet / conclude_bet / settle_bet — see
-- src/lib/data/betsClient.ts). They are reachable by any user with a valid
-- session hitting PostgREST directly, which is a one-line curl.
drop policy if exists "bets_update_accept_mediator" on public.bets;
drop policy if exists "bets_update_mediator"        on public.bets;

-- ────────────────────────────────────────────────
-- 2. comments: two dashboard-added policies
-- ────────────────────────────────────────────────
-- Both were created without a TO clause, so they default to TO PUBLIC — which
-- includes the `anon` role. Combined with the existing
-- `GRANT ALL ON TABLE public.comments TO anon`, the SELECT one
-- (USING (true), no row predicate at all) means **an unauthenticated caller
-- holding only the public anon key can read every comment in the app.**
-- Permissive policies OR together, so it also silently defeats the
-- bet-visibility check in `comments_select_bet_visible` for signed-in users.
--
-- Dropping them leaves migration 006's pair in force:
--   comments_select_bet_visible — TO authenticated, and its EXISTS subquery on
--     `bets` is itself subject to bets_select_visible, so it resolves to
--     "you may read a comment iff you may see its bet". That is the intended
--     rule and it is strictly what the UI needs.
--   comments_insert_self — TO authenticated, WITH CHECK (auth.uid() = user_id),
--     identical in effect to the dashboard INSERT policy being dropped.
drop policy if exists "Users can read comments on visible bets" on public.comments;
drop policy if exists "Users can insert their own comments"     on public.comments;

-- ────────────────────────────────────────────────
-- 3. revote_requests: exact duplicate
-- ────────────────────────────────────────────────
-- Byte-identical to revote_requests_select_authenticated from migration 012
-- (FOR SELECT TO authenticated USING (true)). Harmless, but one less row to
-- read past in pg_policies when debugging a visibility problem.
drop policy if exists "revote_requests_select" on public.revote_requests;
