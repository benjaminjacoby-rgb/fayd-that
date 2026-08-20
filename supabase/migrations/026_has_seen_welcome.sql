-- 026_has_seen_welcome.sql
--
-- Adds users.has_seen_welcome so the one-time welcome walkthrough (posted a
-- bet, choose a mediator, get paid, no fees / play-money disclaimer) is shown
-- exactly once per user, then never again.
--
-- Defaulting to false covers both cases the product asked for in one column:
--   * new users see it the first time they land on the feed after onboarding
--     (their row is freshly inserted with the default)
--   * every existing user sees it once on their next login, since this
--     migration adds the column at false for every pre-existing row too —
--     no backfill needed, the default does the work.

alter table public.users
  add column if not exists has_seen_welcome boolean not null default false;
