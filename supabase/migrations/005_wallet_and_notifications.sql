-- 005_wallet_and_notifications.sql
--
-- 1. Adds an atomic wallet-adjustment RPC so posting / filling / cancelling a
--    bet can change the user's balance without a read-modify-write race.
-- 2. Adds the missing INSERT policy for notifications. Without it, users
--    creating a friend request (or filling someone else's bet) cannot insert
--    a notification row for the recipient under RLS.

-- ────────────────────────────────────────────────
-- wallet adjustment RPC
-- ────────────────────────────────────────────────
create or replace function public.adjust_wallet_balance(delta numeric)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare new_balance numeric;
begin
  update public.users
    set wallet_balance = greatest(0, coalesce(wallet_balance, 0) + delta)
    where id = auth.uid()
    returning wallet_balance into new_balance;
  return new_balance;
end;
$$;

grant execute on function public.adjust_wallet_balance(numeric) to authenticated;

-- ────────────────────────────────────────────────
-- notifications insert policy
-- ────────────────────────────────────────────────
create policy "notifications_insert_authenticated"
  on public.notifications for insert
  to authenticated
  with check (true);
