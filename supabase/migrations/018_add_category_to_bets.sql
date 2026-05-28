-- Migration 018: Add category column to bets table.
-- The category field has been collected in the UI since launch but was
-- dropped at insert time because this column didn't exist. Existing rows
-- default to 'other'.

alter table public.bets
  add column if not exists category text not null default 'other'
  check (category in ('fitness', 'academics', 'social', 'finance', 'other'));
