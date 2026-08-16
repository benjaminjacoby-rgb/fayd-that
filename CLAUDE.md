# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # next dev
npm run build      # next build
npm run typecheck  # tsc --noEmit
npm run lint       # next lint
```

There is no test suite. `typecheck` + `lint` are the only automated verification.

Local setup: `cp .env.local.example .env.local`, `npm install`, `npm run dev`. With
`NEXT_PUBLIC_USE_MOCK_DATA=true` (the default) the whole UI runs off in-memory fixtures and
needs no Supabase project.

## Stack

Next.js 14 App Router, React 18, TypeScript strict, Tailwind, Supabase (auth + Postgres +
realtime). Path alias `@/*` → `./src/*`. Stripe is a declared dependency but `src/lib/stripe/*`
is not imported anywhere yet — payments are stubbed behind `IS_PAYMENTS_LIVE`.

## The two-schema problem (read this first)

The most important thing to understand about this repo: **`src/types/db.ts` does not describe the
actual database.** It is a hand-written set of UI-facing types from an earlier design
(`first_name`/`last_name_initial`, `stake_cents`, `avatar_color`, `bet_participants`,
`mediations`, `yes_probability`). The real schema lives in `supabase/migrations/*.sql` and uses
`full_name`, `wallet_balance` (numeric **dollars**), `avatar_url`, `poster_id`, `poster_position`
(`'YES'`/`'NO'`), `contracts`/`fills`, `audience_type`.

Rather than migrate, the codebase **translates at the data-access boundary**. Every module in
`src/lib/data/` maps DB rows → the `BetView`/`UserRow`/`UserLite` shapes the components expect
(see `dbUserToUserRow` in `src/lib/data/profile.ts`, the `Db*` interfaces at the top of
`src/lib/data/bets.ts`). Components and pages only ever see the UI shapes.

Consequences to respect when editing:
- Money crosses the boundary as **cents** in TS and is stored as **dollars** in Postgres. Divide
  by 100 on write, multiply on read (`walletClient.ts` and `betsClient.ts` both do this).
- Sides are lowercase `"yes" | "no"` in TS, uppercase `'YES'`/`'NO'` in the DB.
- Adding a field means touching three places: the migration, the `Db*` row interface, and the
  mapper.
- `src/lib/supabase/bets.ts` and `src/lib/supabase/friends.ts` are dead code targeting the old
  schema. `src/lib/supabase/users.ts` and `src/lib/supabase/mediations.ts` are still imported by
  pages but query columns/tables that the migrations never created — treat them as legacy, and
  prefer `src/lib/data/*` for anything new.

## Data access layers

Four distinct directories, easy to confuse:

| Path | Role |
| --- | --- |
| `src/lib/supabase/{client,server,middleware}.ts` | Supabase client factories only (`@supabase/ssr`). |
| `src/lib/data/<name>.ts` | **Server**-side queries. Import `supabase/server` (cookie-based). Called from `page.tsx` server components. |
| `src/lib/data/<name>Client.ts` | **Client**-side mutations/queries. `"use client"`, import `supabase/client`. Called from `*Client.tsx` components. |
| `src/lib/supabase/<name>.ts` (bets, friends, users, groups, mediations, notifications) | Legacy — see above. |

Never inline a Supabase query in a component; it belongs in a `data/` module.

## Page conventions

Each route is a pair: `page.tsx` (server component, `export const dynamic = "force-dynamic"`)
fetches data and passes plain props to `<Name>Client.tsx` (`"use client"`) which owns all
interactivity. Server pages branch on `USE_MOCK_DATA` at the top and substitute fixtures from
`src/lib/mock.ts` — keep that branch working when adding a page, since it is the only way to run
the UI without a backend.

Pages wrap content in `<AppShell title unread pendingCount walletCents>` which supplies
`TopBar` + `BottomNav`.

`src/lib/sessionState.ts` is an in-memory `useSyncExternalStore` for cross-page client state that
has no backend yet (read-conversation ids, bets created this session). It is deliberately
temporary and layered over mock data.

## Business logic in the database

Money movement and settlement are Postgres functions, not TypeScript — call them via `.rpc()`:
- `settle_bet(target_bet_id, winning_side)` — payout + notification fan-out. Redefined several
  times (migrations 009, 010, 013); **read the highest-numbered definition**, not the first hit.
- `adjust_wallet_balance(delta)` — atomic wallet read-modify-write, delta in dollars.
- `reset_votes_if_all_requested(target_bet_id)` — clears votes once every participant has filed a
  revote request.
- `user_can_see_bet(...)` — backs the `bets_select_visible` RLS policy (migration 007).

Migrations are numbered and applied in order (`supabase db push`, or paste into the SQL editor).
Never edit an applied migration; add a new numbered file. RLS policies are permissive scaffolding
(`*_select_authenticated`) except where a migration tightened them.

## Auth

Phone OTP via Supabase. `src/middleware.ts` → `src/lib/supabase/middleware.ts` refreshes the
session on every request and redirects unauthenticated users to `/login`; only `/login` and
`/onboarding` are public. If Supabase env vars are absent the middleware passes everything
through, which is what makes mock mode work.

## Styling

Mobile-first, single column capped at `max-w-app` (430px), centered. Dark theme only: colors are
CSS variables in `src/app/globals.css` surfaced as Tailwind tokens (`bg`, `bg2`–`bg4`, `text`,
`text2`, `text3`, `yes`, `no`, `blue`, `orange`, `purple`, `gold`) plus radii `rounded-card`,
`rounded-input`, `rounded-pill`. Use the tokens — no raw hex in components.

## Feature flags

`src/lib/config.ts` centralizes flags and tunables. `USE_MOCK_DATA` is true when the env var says
so **or** when `NEXT_PUBLIC_SUPABASE_URL` is unset. `IS_PAYMENTS_LIVE=false` means "Pay to Lock"
only moves DB state.
