-- 016_has_seen_name_prompt.sql
--
-- Adds bets.has_seen_name_prompt so the one-time "update your name" popup
-- is never shown again after the user saves or dismisses it.

alter table public.users
  add column if not exists has_seen_name_prompt boolean not null default false;
