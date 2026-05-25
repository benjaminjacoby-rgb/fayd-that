-- ─────────────────────────────────────────────────────────────────────────────
-- 003_seed_wallet_balance.sql
--
-- TEMPORARY: gives every user a $200 starting balance for internal testing.
-- Remove (or replace with real Stripe top-up flow) before real money goes live.
--
-- Two effects:
--   1. Backfill any existing user whose wallet_balance is NULL or 0 to 200.
--   2. Change the column default so new sign-ups also start at 200.
-- ─────────────────────────────────────────────────────────────────────────────

update public.users
set wallet_balance = 200
where wallet_balance is null
   or wallet_balance = 0;

alter table public.users
  alter column wallet_balance set default 200;
