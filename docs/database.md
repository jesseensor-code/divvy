# Database

No migration runner — migrations are plain SQL files in `supabase/`, applied
manually by pasting into the Supabase SQL editor. There is no rollback
tooling; each file is written to be safe to re-run where practical
(`add column if not exists`, etc.) but is fundamentally a one-shot script.

## Making a schema change

1. Write a new file: `supabase/migration_00N_description.sql` (next number in
   sequence — current latest is `005`).
2. Run it manually in the Supabase SQL editor against the live project.
3. Update `src/types/entities.ts` to match the new shape.
4. Update any `src/lib/db.ts` query that selects/inserts the changed
   columns — the `select(...)` column lists there are explicit, not `select *`.

There's no staging environment — migrations go straight to the project used
by `npm run dev` (see `.env.local` / `src/lib/supabase.ts` for which project).

## Migration history

| File | What it did |
|---|---|
| `migration_001_initial_schema.sql` | Initial tables: `venues`, `menu_items`, `tabs` (with `creator_token`), `participants`, `items`, `item_splits`. RLS enabled but fully open to `anon`. |
| `migration_002_realtime.sql` | Added `participants.avatar_id`, `menu_items.type`. Enabled Realtime (added to `supabase_realtime` publication) on `tabs`, `participants`, `items`, `item_splits`. |
| `migration_003_paid.sql` | Added `participants.paid` (default `false`). |
| `migration_004_menu_realtime.sql` | Enabled Realtime on `menu_items` so inventory pools sync live across devices. |
| `migration_005_ownership.sql` | Replaced `creator_token` with real ownership: dropped `creator_token`, added `tabs.owner_id` (FK to `auth.users`), added `is_tab_owner()`/`is_venue_owner()` helper functions, replaced the fully-open RLS policies with owner-scoped ones, added a trigger restricting `participants.paid` changes to the tab owner. **Wiped all existing rows** (`truncate ... cascade`) — there was no PoC data worth migrating. |

## Current RLS model (post-`005`)

All policies apply to the `authenticated` role, which includes anonymous
auth sessions (every browser gets one — see [architecture.md](architecture.md)).
There is no separate `anon`-role access anymore.

| Table | Read | Insert | Update | Delete |
|---|---|---|---|---|
| `venues` | anyone | anyone | — | — |
| `menu_items` | anyone | anyone | **venue owner only** (`is_venue_owner`) | **venue owner only** |
| `tabs` | anyone | anyone, but `owner_id` must equal `auth.uid()` | **tab owner only** (`is_tab_owner`) | **tab owner only** |
| `participants` | anyone | anyone | anyone — *except* `paid`, restricted to tab owner via trigger | — |
| `items` | anyone | anyone | anyone | anyone |
| `item_splits` | anyone | anyone | anyone | anyone |

Two SQL helper functions back the owner checks:

- `is_tab_owner(p_tab_id)` — `true` if `tabs.owner_id = auth.uid()` for that tab.
- `is_venue_owner(p_venue_id)` — `true` if the calling user owns *any* tab
  tied to that venue (ownership is really at the tab level; venues don't have
  their own owner column).

Both are `security invoker` (not `definer`) — deliberately, since the
underlying `tabs` SELECT policy is already open to `authenticated`, so no
privilege escalation is needed, and this sidesteps the Supabase advisor
warning that flags `security definer` RPCs.

`participants.paid` is the one column-level permission in the schema. RLS is
row-level, so a `before update` trigger
(`enforce_paid_owner_only`) checks specifically whether `paid` changed and,
if so, whether the caller owns the tab — letting `name`/`avatar_id` stay
open to any participant on the same row.

## What's *not* enforced at the DB level

Anyone with a tab's link can add participants, items, and splits, and read
everything — there's no per-participant write scoping. This is intentional:
the tab link itself is the access control (same trust model as a shared Google
Doc link), and `SelfIdentifyModal` is a UX convention, not a security
boundary. Only tab/venue/participant-paid *mutation of existing state by
non-owners* is blocked.
