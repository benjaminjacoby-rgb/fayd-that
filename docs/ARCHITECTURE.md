# Fayd Architecture

This doc explains how the app actually works today, traced against the live database, not just
the migration files. It's meant to get a mid-level engineer with no prior context to the point
where they can debug a production issue without spelunking through the whole repo first.

**How this was produced:** the live schema was pulled directly from the linked Supabase project
("Fayd design", ref `tgbbfbnlyyahqrhsnoqq`) via `supabase db dump --linked` (schemas `public`,
`storage`, plus the `supabase_realtime` publication) on 2026-08-17, then diffed line-by-line
against `supabase/migrations/001`–`020`. Nine discrepancies were found; five were fixed same-day
via migrations 021–024 (applied and re-verified against a fresh dump), one is intentionally held
back pending a product decision, and three were confirmed as harmless. See "Known rough edges"
and the data model section for the full account. Everything else (code flows, folder structure)
is traced from the source in this repo at the same point in time.

Also read [CLAUDE.md](../CLAUDE.md) first if you haven't — it covers the two-schema translation
pattern (`src/types/db.ts` UI shapes vs. the real Postgres schema) that every data-access module
in this codebase works around. This doc assumes you've read that.

---

## 1. Data model

### Schema drift: live database vs. migration files

**Status: fixed as of migrations 021–024 (applied 2026-08-17).** This section is kept as a record
of what was found and how it was closed — read it if you're wondering why 021–024 exist, or if
you're auditing whether a *future* drift has crept back in.

The original `supabase db dump --linked` comparison (schemas `public` + `storage`, plus the
`supabase_realtime` publication) found **nine things that no migration file (001–020) created** —
i.e. `supabase/migrations/` alone would not have reproduced the production schema; someone made
these changes directly (dashboard SQL editor, based on the human-readable default policy names on
two of them) and never wrote them back into a migration.

| # | What | Where | Resolution |
|---|------|-------|---|
| 1 | `group_members.status` column (`text`, default `'active'`, check `in ('active','pending')`) | `group_members` | **Recorded** in [021](../supabase/migrations/021_group_join_approval.sql) — real, shipped feature, kept |
| 2 | Index `group_members_group_status_idx` on `(group_id, status)` | `group_members` | **Recorded** in 021 |
| 3 | Policy `group_members_insert_pending_self` | `group_members` | **Recorded** in 021 — kept |
| 4 | Policy `group_members_update_admin` | `group_members` | **Recorded** in 021 — kept |
| 5 | Policy `groups_update_admin` | `groups` | **Recorded** in 021 — kept |
| 6 | `bets.closed_at` column (`timestamptz`, nullable) | `bets` | **Recorded and wired up** in [024](../supabase/migrations/024_close_bet_closed_at.sql) — `close_bet()` now stamps it |
| 7 | Policies `bets_update_accept_mediator` and `bets_update_mediator` | `bets` | **Dropped** in [022](../supabase/migrations/022_rls_policy_hardening.sql) — over-broad, unused by app code |
| 8 | Policies `"Users can insert their own comments"` / `"Users can read comments on visible bets"` | `comments` | **Dropped** in 022 — the SELECT one had no `TO` clause and exposed all comments to `anon`, see below |
| 9 | Duplicate policy `revote_requests_select` | `revote_requests` | **Dropped** in 022 — exact duplicate, no behavior change |

A tenth issue, not in the original dump comparison, surfaced while writing the fix migrations and
was closed in the same pass:

| # | What | Where | Resolution |
|---|------|-------|---|
| 10 | Policy `group_members_insert_self` (migration 002) had no predicate on `status`, so it silently overlapped policy #3 above and let any authenticated user join any group as `status='active'`, admin approval and invite code both skipped | `group_members` | **Dropped** in [023](../supabase/migrations/023_group_join_bypass_fix.sql) |

**Why #7, #8, and #10 mattered, not just #1–6, #9 (bookkeeping):**

- **#7**: migration 020's own comment explicitly explains why a broad UPDATE policy for mediators
  is dangerous — RLS `USING`/`WITH CHECK` constrains which *rows* an UPDATE can touch, not which
  *columns* changed. `bets_update_mediator` (`USING (mediator_id = auth.uid())`, no column
  restriction) let any assigned mediator rewrite `question`, `stake_amount`, `poster_id`, or even
  flip `status`/`winning_side` directly — bypassing `settle_bet()`'s payout loop entirely, i.e.
  marking a bet resolved with nobody paid. The app itself never called `.update()` on `bets` for
  mediator actions (it uses the `accept_mediator`/`close_bet`/`conclude_bet`/`settle_bet` RPCs —
  see [betsClient.ts](../src/lib/data/betsClient.ts)), so this was only reachable by something
  bypassing the app's own client code — e.g. a valid session token hitting the PostgREST API
  directly — but the policy was live and permissive regardless of whether the UI used it.
- **#8**: `"Users can read comments on visible bets"` was `FOR SELECT USING (true)` with **no
  `TO` clause**, which Postgres defaults to `TO PUBLIC` — including the `anon` role. Combined with
  the pre-existing `GRANT ALL ON TABLE public.comments TO anon`, **anyone holding the public anon
  key could read every comment in the app without signing in.** Because permissive policies OR
  together, it also nullified `comments_select_bet_visible` for signed-in users, so bet-audience
  scoping didn't apply to comments at all. Dropping it restores migration 006's intended rule
  ("you may read a comment iff you may see its bet").
- **#10**: since permissive policies OR together, the narrower `group_members_insert_pending_self`
  added nothing while the unrestricted `group_members_insert_self` (migration 002) was still
  active — any authenticated user could insert themselves into **any** `group_id` with
  `status='active'`, skipping the admin entirely. Group ids are readable
  (`groups_select_authenticated` is `USING (true)`), so this needed no invite code. The
  migration-008 trigger then fired on that INSERT and added them to `conversation_participants`,
  which is what `messages_select_participant` gates on — so the same single request also granted
  read access to that group's entire chat history.

All four fix migrations were re-verified against a fresh `db dump --linked` after applying: the
five dropped policies confirmed gone, the four kept/recorded policies confirmed present with
matching definitions, `bets.closed_at` confirmed present, and `close_bet()` confirmed to stamp it.
The `storage` schema (the `avatars` bucket + its four `storage.objects` policies from migration
011) and the `supabase_realtime` publication (containing only `public.messages`) were separately
dumped and confirmed to match migrations exactly — no drift there.

Everything else — every other table, column, function, and trigger created by migrations
001–020 — was confirmed present in the live schema with matching definitions. In particular,
`settle_bet()` in the live DB (pre-existing, unrelated to 021–024) matches migration 020
byte-for-byte (the fifth and final rewrite; earlier versions in 006/009/010/013/015 are all
superseded — **always read 020's copy**, per the note in CLAUDE.md). See "Known rough edges"
below for the one thing intentionally left as-is: `settle_bet()`'s missing notification fan-out
(a rewrite exists at `supabase/migrations_on_hold/025_settle_bet_notification_fanout.sql` but is
deliberately not applied pending a product call on whether users should start seeing new
notifications).

### Tables

Types: money columns are Postgres `numeric` storing **dollars**; TypeScript converts to/from
cents at the data-access boundary (see CLAUDE.md).

**`users`** — extends `auth.users` (Supabase's built-in auth table) 1:1 via `id` FK with
`on delete cascade`.
| column | type | notes |
|---|---|---|
| id | uuid PK | = `auth.users.id` |
| username | text, unique, not null | |
| full_name | text | nullable; UI splits this into "first name" at the boundary, see `dbUserToUserRow` |
| phone_number | text, unique | |
| avatar_url | text | |
| wallet_balance | numeric, default 200, not null | dollars; the $200 starting balance is a migration-003 testing seed, explicitly flagged for removal before real money goes live |
| created_at | timestamptz, default now() | |
| has_seen_name_prompt | boolean, default false | gates a one-time "update your name" popup |

RLS: `users_select_authenticated` (any authenticated user can read all users — permissive by
design), `users_insert_self`/`users_update_self` (self only).

**`bets`**
| column | type | notes |
|---|---|---|
| id | uuid PK | |
| poster_id | uuid FK → users, `on delete set null` | |
| question | text, not null | checked against `banned_words` on insert/update via trigger `bets_check_language` |
| poster_position | text, check `YES`/`NO` | |
| stake_amount | numeric, not null | dollars |
| audience_type | text, check `friends`/`group`/`specific_friends` | |
| group_id | uuid FK → groups, `on delete set null` | |
| end_date | timestamptz | legacy field, repurposed as a backend default per migration 007's comment; not the user-facing expiry |
| expires_at | timestamptz | the actual poster-chosen expiry (migration 007) |
| is_concluded | boolean, default false | |
| mediator_type | text, check `none`/`self`/`requested` | |
| mediator_id | uuid FK → users, `on delete set null` | only ever set for `requested` mediation once someone accepts |
| status | text, check `open`/`filled`/`closed`/`concluded`/`settled` | |
| winning_side | text, check `YES`/`NO` | migration 013 |
| settled_at | timestamptz | migration 015 |
| category | text, default `'other'`, check one of 5 values | migration 018; **dropped from the composer UI**, DB column kept for legacy rows, see below |
| is_removed / removed_at / removed_by | boolean / timestamptz / uuid FK → users | admin soft-delete, migration 019 |
| closed_at | timestamptz | recorded + wired into `close_bet()` by migration 024 (see drift table above) |

RLS: `bets_insert_self` (poster only), `bets_select_visible` (routes through
`user_can_see_bet()` + `is_admin()` + `is_blocked_pair()`, see Auth section below),
`bets_update_self` (poster only), `bets_update_admin` (admin only). The two over-broad mediator
UPDATE policies from the drift table (#7) were dropped in migration 022.

**`contracts`** — one row per "line" on a bet (the poster's original line, plus any
sub-contracts opened later). `bet_id`, `creator_id` FK → users, `position` (YES/NO),
`odds` (0–100 numeric, the % probability), `stake_amount`, `amount_remaining`, `is_filled`.

**`fills`** — one row per stake placed against a contract, including the creator's own
locked stake (a "self-fill" where `filler_id = contracts.creator_id`). `contract_id`,
`filler_id` FK → users (`on delete set null`), `amount` (dollars).

**`bet_targets`** — composite PK `(bet_id, user_id)`, the explicit recipient list for
`audience_type = 'specific_friends'` (migration 007).

**`votes`** — one per `(bet_id, voter_id)` via unique index `votes_bet_voter_unique`
(migration 006). `vote` check `YES`/`NO`.

**`revote_requests`** — one per `(bet_id, user_id)` (migration 012), tracks agreement to
re-open voting after a disputed result.

**`bet_poll_votes`** — thumbs up/down on feed cards, separate from `votes` (which is the
binding resolution vote). One per `(bet_id, user_id)`, `vote` check `yes`/`no` (lowercase,
unlike `votes`'s uppercase — inconsistent casing convention between the two tables, worth
noting if you're writing code that touches both).

**`bet_reactions`** — emoji reactions, unique on `(bet_id, user_id, emoji)`.

**`comments`** / **`comment_likes`** — bet-card discussion. `comment_likes` unique on
`(comment_id, user_id)`.

**`reports`** — moderation reports (migration 019). `status` check
`open`/`resolved`/`dismissed`. Written by [`POST /api/reports`](../src/app/api/reports/route.ts).

**`groups`** / **`group_members`** — `groups.join_code` unique 6-char code.
`group_members.role` check `admin`/`member`, `group_members.status` check `active`/`pending`
(recorded in migration 021, see drift table above — powers the join-request/admin-approval flow
in `groupsClient.ts`).

**`conversations`** / **`conversation_participants`** / **`messages`** — chat backbone.
`conversations.type` check `direct`/`group`. `conversation_participants` unique on
`(conversation_id, user_id)` (migration 008) plus `last_read_at` (migration 017, powers
unread counts). `messages.bet_id` optionally links a message to a shared bet card.

**`friendships`** — `status` check `pending`/`accepted`. Directional (`requester_id`/
`addressee_id`) but treated as symmetric once accepted.

**`blocked_users`** — composite PK `(blocker_id, blocked_id)`, directional, check
`blocker_id <> blocked_id` (migration 019). Blocking severs any existing friendship both
directions via trigger `blocked_users_sever_friendship`.

**`notifications`** — `type` (free text, e.g. `bet_won`, `bet_filled`, `friend_request`),
`reference_id`/`reference_type` (polymorphic pointer), `actor_id` (migration 010, who did
the thing — added because joining through `reference_id` didn't generalize past
`friend_request`).

**`admin_phone_numbers`** / **`banned_words`** — small lookup tables, migration 019.
Admin status is phone-number based (`is_admin()`, normalizes to last-10-digits so formatting
doesn't matter), not a role column — works regardless of signup order but means granting admin
access requires an `insert into admin_phone_numbers`, not a UI action.

### RLS design pattern

Straightforward per-table policies (`_select_authenticated`, `_insert_self`, etc.) are the norm.
Three places need `SECURITY DEFINER` helper functions instead, because a naive `USING` clause
that joins into another RLS-protected table causes recursion or simply can't see rows it needs
to check:
- `user_can_see_bet()` — audience-based bet visibility (friends/group/specific_friends), backs
  `bets_select_visible`. Comment in migration 007 explicitly documents the recursion problem this
  solves.
- `is_admin()` / `is_blocked_pair()` — same reasoning, used by `bets_select_visible`,
  `reports_select_admin`, `friendships_insert_party`.
- `contains_banned_word()` — not RLS, but similarly a `SECURITY DEFINER` function invoked by the
  `bets_check_language` trigger so it can read `banned_words` regardless of the caller's own
  read access.

---

## 2. Core flows, end to end

### How a bet gets created

1. **UI**: [`CreateBetClient.tsx`](../src/app/create/CreateBetClient.tsx) — the composer screen.
   State: question text, YES/NO odds slider (`yesPercent`), poster's side, stake, audience
   (friends/group + optional specific recipients), mediator choice (self/request a friend/open
   request), optional expiry. `canSubmit` (line 179) gates the Post button on question length,
   banned-word pre-check, stake ≤ wallet balance, and audience/mediator completeness.
   - The banned-word check here is client-side UX only (`containsBannedWord`,
     [`src/lib/moderation.ts`](../src/lib/moderation.ts)) — the real enforcement is the DB
     trigger `bets_check_language` (migration 019), which the client can't bypass by calling the
     API directly.
2. **`submit()`** (line 210) builds the payload and calls
   [`createBet()`](../src/lib/data/betsClient.ts:35) (or takes a mock-data shortcut if
   `USE_MOCK_DATA` is set — see CLAUDE.md's page-convention section).
3. **`createBet()`** does four sequential writes, all client-side via `supabase-js` (RLS-gated,
   no server route involved):
   1. `insert into bets` — `poster_position`/`stake_amount` translated from cents→dollars and
      lowercase→uppercase at this boundary (line 49–66). `audience_type` is derived: `group` if
      scope is group, `specific_friends` if specific friends were picked, else `friends`.
   2. If `audience_type = 'specific_friends'`: `insert into bet_targets` (one row per recipient)
      plus a `bet_targeted` notification per recipient via
      [`insertNotification()`](../src/lib/data/notificationsClient.ts) (line 70–92).
   3. `insert into contracts` — one row representing the poster's own line, `is_filled: true`,
      `amount_remaining: 0` (line 97–110).
   4. `insert into fills` — a "self-fill" for that contract, `filler_id = poster_id`, `amount =
      stake` (line 112–117). This is what makes `stake_amount` on `bets` mostly informational —
      the actual money-tracking is entirely in `contracts`/`fills`.
   5. `deductWalletCents(stake)` (line 119) → calls the `adjust_wallet_balance` RPC (see wallet
      section below).
   - Note: `category` and `yes_probability`/odds are accepted by the function signature but
     `category` is a documented no-op (dropped from the composer UI per the comment at line
     30–33; DB column keeps its `'other'` default) and odds are written onto the `contracts` row,
     not `bets` (there's no `bets.yes_probability` column — see CLAUDE.md's two-schema note).
4. Client does `router.push("/")` + `router.refresh()` to return to the feed; the new bet is also
   optimistically pushed into [`sessionState.ts`](../src/lib/sessionState.ts) via `addMyPost` so
   it appears instantly before the server round-trip completes.

**Filling someone else's bet** ("Fayd that") is a separate, simpler path:
[`fillBet()`](../src/lib/data/betsClient.ts:139) re-checks the bet's `expires_at`/`status`
server-side (closing a race where the UI is stale), inserts a `fills` row against either the
original contract or a specified sub-contract, deducts the filler's wallet, and notifies the
recipient (skipping self-notifications).

**Opening a counter-line on an existing bet** ("sub-contract") is
[`postSubContract()`](../src/lib/data/betsClient.ts:307) — same contract+self-fill+wallet-deduct
pattern as bet creation, just attached to an existing `bet_id`.

### How a bet gets settled/resolved and how coin balances update

Two paths converge on the same RPC:

**Mediator path** — [`ResolutionSection.tsx`](../src/components/ResolutionSection.tsx) only
renders once `bet.status === 'closed'`. If the bet has an assigned mediator (self-mediation or
an accepted `requested` mediator), only that user sees a "Settle this bet" YES/NO picker
(lines 138–207); everyone else sees "Waiting for mediator to settle." Confirming calls
[`settleBet()`](../src/lib/data/resolutionClient.ts:86), which is a thin wrapper around
`supabase.rpc('settle_bet', { target_bet_id, winning_side })`.

**Vote path** — no mediator: any participant (poster, contract creators, external fillers) can
vote YES/NO via `castVote()` → `insert into votes`. After each vote, the client locally
recomputes the tally (`tallyFor`, line 32) and — if the new vote pushes either side to the
required majority (unanimous for ≤2 participants, `floor(n/2)+1` for 3+) — calls `settleBet()`
itself (line 235–243). If votes are split with no majority possible (`disputed`, line 220–222),
the UI offers "Request Revote," which calls `requestRevote()` →
`reset_votes_if_all_requested()` RPC; once every participant has requested a revote, that RPC
wipes `votes` and `revote_requests` for the bet so voting restarts clean.

**The `settle_bet(target_bet_id, winning_side)` Postgres function** (migration 020, latest of
five rewrites — see [`020_mediation_backend_fixes.sql`](../supabase/migrations/020_mediation_backend_fixes.sql))
is where money actually moves:
1. Validates `winning_side`, that the bet isn't already resolved.
2. Computes the participant set (poster + fill-based).
3. **Authorization, done inside the function, not via an RLS UPDATE policy**: resolves an
   "effective mediator" (`bet_effective_mediator()` — poster if self-mediated, `mediator_id` if
   requested-and-accepted, else null) and requires `auth.uid()` to match it; if there's no
   mediator, requires the caller to be a participant and re-derives/checks the vote majority
   server-side (never trusts the client's tally).
4. **Per-contract payout loop** (not per-fill — this was a deliberate fix in migration 013 after
   the original per-fill math over-paid partial fills): for each contract on the bet, computes
   `creator_odds` from `contracts.odds`/`position`, sums `self_fill_amount` (creator's own stake)
   and `total_external` (everyone else's stake against that contract).
   - If the contract's `position` won: creator gets `self_fill_amount + total_external` (the
     whole pot).
   - If the contract's `position` lost: each external filler gets `fill.amount / filler_odds`;
     the creator gets back any *unmatched* portion of their own stake
     (`self_fill_amount - total_external * creator_odds / filler_odds`, floored at 0).
   - All payouts are `update users set wallet_balance = wallet_balance + win_amount` — direct
     writes inside the `SECURITY DEFINER` function, not via the `adjust_wallet_balance` RPC (that
     RPC is scoped to `auth.uid()` only, which wouldn't work for crediting other users).
5. Marks the bet `status = 'settled'`, `is_concluded = true`, `winning_side`, `settled_at = now()`.
6. Notification fan-out for `bet_won`/`bet_lost` was added in migration 010's version but dropped
   in 013's rewrite and never restored (015, 020 both re-created the function without it) — live
   DB matches 020, so no fan-out currently happens on settle. A restore exists at
   `supabase/migrations_on_hold/025_settle_bet_notification_fanout.sql`, verified byte-identical
   to 020 aside from the fan-out block, but is **deliberately not applied** — see "Known rough
   edges" below.

**Closing and concluding** are separate, narrower RPCs
([`close_bet`](../supabase/migrations/020_mediation_backend_fixes.sql), `conclude_bet`,
`accept_mediator`) — all `SECURITY DEFINER` functions doing one hardcoded UPDATE each, explicitly
chosen over a broader RLS UPDATE policy (see migration 020's own reasoning, quoted in the drift
section above) because a mediator/poster-scoped UPDATE policy would let the caller rewrite any
column on the row, not just the one the action is supposed to touch.

### How a user's coin balance is calculated/displayed

**Stored, not derived.** `users.wallet_balance` is a plain numeric column, read directly on every
page load (`getCurrentUserRow()` in [`profile.ts`](../src/lib/data/profile.ts:22), multiplied by
100 into cents at the boundary). All balance changes go through
[`adjust_wallet_balance(delta)`](../supabase/migrations/005_wallet_and_notifications.sql) — an
atomic `update ... set wallet_balance = greatest(0, wallet_balance + delta) where id = auth.uid()
returning wallet_balance` — called via
[`walletClient.ts`](../src/lib/data/walletClient.ts)'s `deductWalletCents`/`creditWalletCents`
wrappers. This RPC is scoped to the caller (`auth.uid()`), which is why `settle_bet()` can't reuse
it for paying out *other* users and instead writes to `users.wallet_balance` directly as a
`SECURITY DEFINER` function.

There is no ledger/transaction-history table — the current balance is the only persisted state;
there's no way to reconstruct "how did I get to this balance" from the DB alone (contracts/fills
give you the bet-level detail, but nothing timestamps a balance delta as a discrete event outside
of that).

### Auth flow

1. **Client**: [`LoginClient.tsx`](../src/app/login/LoginClient.tsx) — phone number in, calls
   `supabase.auth.signInWithOtp({ phone, options: { channel: 'sms' } })`. This is Supabase's
   built-in phone-OTP auth (Twilio or similar SMS provider configured on the Supabase project
   side, not in this repo) — no custom backend code sends the SMS.
2. User enters the 6-digit code; `supabase.auth.verifyOtp({ phone, token, type: 'sms' })`
   exchanges it for a session (sets auth cookies via `@supabase/ssr`'s browser client). On
   success, the client checks `users.username` for that `auth.users.id` — if unset, routes to
   `/onboarding`; if set, routes to `/`.
3. **Onboarding**: [`OnboardingClient.tsx`](../src/app/onboarding/OnboardingClient.tsx) —
   collects first/last name, username, avatar color, then `upsert`s into `public.users` (this is
   the only write that creates the `public.users` row — there's no DB trigger auto-creating it
   from `auth.users` on signup, so a user who verifies OTP but abandons onboarding has an
   `auth.users` row with no matching `public.users` row).
4. **Every subsequent request**: [`src/middleware.ts`](../src/middleware.ts) → `updateSession()`
   in [`src/lib/supabase/middleware.ts`](../src/lib/supabase/middleware.ts). This runs on every
   route except static assets (see the `matcher` config). It creates a request-scoped Supabase
   server client, calls `supabase.auth.getUser()` (which transparently refreshes the session via
   the refresh-token cookie if the access token expired), and redirects to `/login` if there's no
   user and the path isn't one of `PUBLIC_PATHS` (`/login`, `/onboarding`, `/terms`, `/privacy`).
   - If `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` are unset, this function
     short-circuits and passes every request through unchanged — this is the specific code path
     that makes `USE_MOCK_DATA` mode work without a Supabase project at all.
5. **Server components** (`page.tsx` files) get their own request-scoped client via
   [`src/lib/supabase/server.ts`](../src/lib/supabase/server.ts) (cookie-based, read-only cookie
   writes swallowed in a `try/catch` since Server Components can't set cookies — middleware
   already handled the refresh). **Client components** use
   [`src/lib/supabase/client.ts`](../src/lib/supabase/client.ts)'s browser client.

Once verified, "confirmed as that user" downstream is just `auth.uid()` inside Postgres — every
RLS policy and every `SECURITY DEFINER` function keys off it directly; there's no separate
session-validation layer in application code.

### Realtime/websocket flows

There is exactly **one** realtime subscription in the whole app:
[`ChatClient.tsx`](../src/app/messages/[id]/ChatClient.tsx:88-146) subscribes to Postgres
`postgres_changes` INSERT events on `messages` filtered to the current `conversation_id`. This
depends on `messages` being added to the `supabase_realtime` publication, which migration 008
does explicitly (`alter publication supabase_realtime add table public.messages`) — if a fresh
project is ever set up from migrations, this table must be in the publication or chat won't
live-update; it's not something Supabase does automatically per-table.

On receiving a row, the handler skips the sender's own messages (already shown optimistically),
fetches the sender's profile for the bubble, and appends to local state. No other table
(`notifications`, `bets`, `comments`, etc.) has realtime enabled — notification/feed updates are
plain fetch-on-load plus `router.refresh()` after mutations, not subscriptions. If you're
debugging "why doesn't X update live," the answer is almost always "it's not wired to realtime at
all, only chat is."

---

## 3. Folder structure

**`src/app/`** — Next.js App Router pages. Each route folder pairs a `page.tsx` (server
component — fetches data via `src/lib/data/*.ts`, branches on `USE_MOCK_DATA`, passes plain
props down) with a `*Client.tsx` (`"use client"` — owns all interactivity, state, and mutations).
Notable routes: `create/` (bet composer), `mediate/` (mediator's queue of bets needing a
decision), `admin/` (moderation dashboard, gated by `is_admin()`), `messages/[id]/` (chat, the
one realtime consumer), `groups/[id]/`, `pending/` (bets awaiting fill or resolution),
`onboarding/`, `login/`. `src/app/api/reports/route.ts` is the only server API route in the
app — everything else talks to Supabase directly from the client or from server components,
bypassing a custom backend entirely.

**`src/components/`** — shared React components used across multiple pages: bet cards
(`BetCard.tsx`, `PostCard.tsx`), the resolution/voting UI (`ResolutionSection.tsx`), sheets
(bottom-sheet modals, `*Sheet.tsx`), `AppShell.tsx` (the `TopBar` + `BottomNav` wrapper every
page uses), and `components/ui/` for generic primitives (`Button`, `Pill`, `Sheet`). Nothing
here talks to Supabase directly — components receive data as props and call functions from
`src/lib/data/*Client.ts` for mutations.

**`src/lib/data/`** — the data-access boundary described in CLAUDE.md. Split into server modules
(no suffix — `bets.ts`, `profile.ts`, plain functions using the cookie-based server client, called
from `page.tsx`) and client modules (`*Client.ts` — `"use client"`, browser client, called from
interactive components). This is where DB row shapes get translated into the UI-facing types from
`src/types/db.ts`; nothing outside this folder should touch a raw Supabase table name.

**`src/lib/supabase/`** — thin client factories only (`client.ts`, `server.ts`,
`middleware.ts`) plus legacy modules (`bets.ts`, `friends.ts`) that CLAUDE.md flags as dead code
targeting a schema that no longer exists. Note: CLAUDE.md also mentions `users.ts` and
`mediations.ts` here as "legacy but still imported" — as of this repo state those two files don't
exist (removed, likely in commit `1bd9b30` "block, report, mediator" per `git log`), and nothing
imports them; that part of CLAUDE.md is stale and should be updated.

**`src/lib/`** (top level) — cross-cutting utilities: `config.ts` (feature flags, described
below), `mock.ts` (the fixture data backing `USE_MOCK_DATA` mode), `sessionState.ts` (in-memory
`useSyncExternalStore`-based client state for things with no backend yet, like session-local
optimistic post lists), `moderation.ts` (client-side banned-word pre-check, mirrored server-side
by the DB trigger), `avatar.ts`, `format.ts`, `contacts.ts` (device-contacts matching for
onboarding's friend-finder step).

**`src/lib/stripe/`** — exists as a declared dependency but is not imported anywhere in the app
yet (confirmed via CLAUDE.md and cross-checked — no `stripe` imports outside this folder).
Payments are fully stubbed behind `IS_PAYMENTS_LIVE` (`src/lib/config.ts:6`), which currently only
gates whether "Pay to Lock" moves real money vs. just flipping DB status — no Stripe code path is
live.

**`src/types/db.ts`** — the hand-written UI-facing type layer (`BetView`, `UserRow`, `UserLite`,
etc.) that every `src/lib/data/*` module maps into. Does not describe the real database — see
CLAUDE.md's two-schema section for why this exists and how to extend it safely.

**`supabase/migrations/`** — numbered SQL migrations, 001–024, applied in order. History was
repaired 2026-08-17 so `supabase migration list --linked` correctly shows 001–024 as applied on
remote (001–020 had been applied by hand via the dashboard SQL editor originally, so the CLI's
tracking table didn't know about them until the repair). See the schema drift section above for
the drift that existed before 021–024 closed it.

**`supabase/migrations_on_hold/`** — migrations that are written and reviewed but deliberately not
applied. Currently just 025 (settle_bet notification fan-out) — see "Known rough edges." Kept out
of `supabase/migrations/` specifically so a routine `db push` won't pick it up by accident.

---

## 4. Known rough edges

Flagged while tracing the app. Items with a migration number were fixed same-day; the rest are
noted with file/line references, not fixed.

**Fixed (2026-08-17, migrations 021–024, all re-verified live):**
- Group join-approval feature (`group_members.status` + supporting index + 3 policies) recorded
  in [021](../supabase/migrations/021_group_join_approval.sql) — previously live-only, would have
  broken on a fresh database provisioned from migrations alone.
- Two over-broad `bets` UPDATE policies (`bets_update_mediator`, `bets_update_accept_mediator`)
  dropped in [022](../supabase/migrations/022_rls_policy_hardening.sql) — they let a mediator
  rewrite arbitrary columns on a bet via a direct REST call, not just the fields the app's RPCs
  intend to change.
- Two dashboard-added `comments` policies dropped in 022 — one had no `TO` clause and exposed
  every comment in the app to the unauthenticated `anon` role.
- Duplicate `revote_requests_select` policy dropped in 022 — harmless, just pruned.
- `group_members_insert_self` (migration 002) dropped in
  [023](../supabase/migrations/023_group_join_bypass_fix.sql) — it had no predicate on `status`
  and silently let any authenticated user join any group as an active member, skipping admin
  approval and also picking up read access to that group's chat via the migration-008 trigger.
- `bets.closed_at` recorded and wired into `close_bet()` in
  [024](../supabase/migrations/024_close_bet_closed_at.sql) — previously an orphan column nothing
  wrote to. Bets closed before 2026-08-17 keep `closed_at = null` (no way to backfill a time that
  was never recorded).

**Open — intentionally not applied:**
- **`settle_bet()`'s notification fan-out is still missing.** Migration 010 added
  `bet_won`/`bet_lost` notifications to every participant when a bet settles; migration 013's
  "correct payout" rewrite dropped the fan-out block, and neither 015 nor 020 (both later
  rewrites of the same function) brought it back — so a bet has settled in silence since 013. The
  UI is ready for it (`NotificationsClient.tsx:195-205` and `:245-246` already render both
  types), so this is a dead read path waiting on rows that stopped being written. A restore is
  written and verified (`diff`'d against 020: only the fan-out block and its three variable
  declarations differ, payout math untouched) at
  `supabase/migrations_on_hold/025_settle_bet_notification_fanout.sql`, but is deliberately held
  back rather than applied — it's a user-visible behavior change (existing users start getting
  notifications they haven't been getting), which is a product call, not a schema-drift fix. If
  you're reading this and decide to ship it: move the file into `supabase/migrations/`, then
  `supabase db push --linked`.
- **Inconsistent vote-value casing.** `votes.vote` is uppercase (`'YES'`/`'NO'`, matches
  `bets.poster_position`/`winning_side`) but `bet_poll_votes.vote` is lowercase (`'yes'`/`'no'`).
  Two structurally similar "did you vote yes or no" tables with opposite casing conventions —
  easy to introduce a bug moving code between them.
- **CLAUDE.md is stale on one point**: it lists `src/lib/supabase/users.ts` and
  `src/lib/supabase/mediations.ts` as legacy-but-still-imported. Neither file exists in the repo
  as of this doc (git history shows they were removed, most likely in commit `1bd9b30`), and
  nothing imports them. Not a code problem, just a doc that needs a one-line fix.
- **`stake_amount` on `bets` is mostly vestigial** once a bet is created — the real
  money-accounting lives entirely in `contracts`/`fills` (see the bet-creation flow above). The
  column is still written and presumably still read somewhere for display, but if you're
  debugging a payout discrepancy, look at `contracts`/`fills`, not `bets.stake_amount`.
- **No transaction ledger.** `users.wallet_balance` is the only persisted balance state (see
  section 2). There's no audit trail of individual balance changes outside of what you can infer
  from `fills` + `settle_bet` timing — if a user disputes their balance, reconstructing "what
  happened" means correlating `fills`, `contracts`, and `bets.settled_at` by hand.
- **`admin_phone_numbers` is a manual allowlist**, not a role/flag on `users`. Granting admin
  access requires a direct DB insert (see
  [migration 019](../supabase/migrations/019_reports_bans_and_blocking.sql:35)); there's no
  admin-management UI. `ADMIN_EMAIL` in
  [`src/app/api/reports/route.ts:7`](../src/app/api/reports/route.ts:7) is similarly hardcoded
  (a single email address), not derived from `admin_phone_numbers` or any table — the two admin
  concepts (who can see `/admin` in-app vs. who gets the report email) are defined in two
  unrelated places and could drift independently.
