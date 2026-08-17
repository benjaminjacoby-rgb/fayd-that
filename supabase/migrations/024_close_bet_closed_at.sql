-- 024_close_bet_closed_at.sql
--
-- `bets.closed_at` exists in the live database, is created by no migration, and
-- is read or written by nothing in src/ — an orphan column left behind by a
-- half-finished change. `close_bet()` (migration 020) sets status='closed' but
-- never stamps it.
--
-- Two ways to resolve that: drop the column, or finish it. Finishing it is the
-- reversible option and it matches the audit-timestamp pattern already on this
-- table (settled_at from 015, removed_at from 019), so:
--
--   1. record the column in migration history (no-op against live)
--   2. stamp it in close_bet()
--
-- Existing rows closed before today keep closed_at = null; there is no way to
-- backfill them, since nothing recorded the time in the first place. Treat a
-- null closed_at on a status='closed' bet as "closed before 2026-08-17".

alter table public.bets
  add column if not exists closed_at timestamptz;

-- Unchanged from 020 except for the closed_at stamp on the final UPDATE.
create or replace function public.close_bet(target_bet_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  bet_row public.bets%rowtype;
begin
  select * into bet_row from public.bets where id = target_bet_id;
  if not found then raise exception 'bet not found'; end if;
  if bet_row.status <> 'open' then
    raise exception 'only an open bet can be closed';
  end if;
  if auth.uid() is distinct from bet_row.poster_id
     and auth.uid() is distinct from public.bet_effective_mediator(bet_row) then
    raise exception 'only the poster or mediator can close this bet';
  end if;

  update public.bets
     set status    = 'closed',
         closed_at = now()
   where id = target_bet_id;
end;
$$;

grant execute on function public.close_bet(uuid) to authenticated;
