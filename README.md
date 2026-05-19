# Fayd

Social bet-posting app — Instagram-style feed of bets between friends and groups. Next.js 14 (App Router) + Supabase + Stripe Connect + Mapbox.

## Quickstart

```bash
cp .env.local.example .env.local
npm install
npm run dev
```

By default `NEXT_PUBLIC_USE_MOCK_DATA=true` so the UI runs without Supabase. Flip it to `false` once Supabase credentials are set and the migration in `supabase/migrations/0001_initial_schema.sql` has been applied.

## What's built (Phase 1)

- Phone-OTP auth via Supabase + onboarding (name, last-initial, username)
- Home feed with bet cards, probability bars, detail sheet
- Create bet (question, category, probability slider, payout preview, stake, expiry, scope, mediator selection)
- Pending bets (status-gated actions: pay-to-lock, confirm outcome, dispute)
- Mediator page with earnings counter
- Profile with stats, wallet (mock), friends/groups lists
- Bottom tab nav + top bar with notification bell

## Not yet built

- Phase 2: friend search/requests UI, group create/join UI, group bet feed
- Phase 3: Mapbox map view, geo-scoped bets, pin drop
- Real Stripe Connect flows (gated by `NEXT_PUBLIC_IS_PAYMENTS_LIVE`)
- Realtime subscriptions on the feed
- Tightened RLS policies (current ones are permissive scaffolding)

## Architecture notes

- All Supabase queries live in `src/lib/supabase/*` — never inline in components
- All Stripe logic in `src/lib/stripe/*`
- Server components by default; `*Client.tsx` files mark interactive client components
- Mobile-first, `max-w-app` (430px) centered
