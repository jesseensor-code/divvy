# Architecture

## Stack

React 18 + Vite + TypeScript, no backend server. Supabase provides Postgres,
Realtime, and (anonymous) Auth. Deployed on Vercel as a static SPA —
`vercel.json` rewrites all routes to `index.html` so client-side routing
works on refresh/deep-link.

## Local-first state with Supabase sync

`src/context/TabContext.tsx` is the core of the app. The model:

1. **Local React state is the source of truth for the current device.**
   Mutations (`addItem`, `setSplit`, `addParticipant`, etc.) update state
   synchronously and optimistically — no loading spinners, no waiting on a
   round trip.
2. **Every mutation also fires a write to Supabase**, fire-and-forget, via
   `syncWrite()`. `syncWrite` wraps the write in `withRetry()`
   (`src/lib/utils.ts`): 3 attempts with backoff. If all 3 fail, `syncError`
   is set to `true` and `Tab.tsx` shows a banner ("Sync issue — changes may
   not be visible to others. Retrying…"). A later successful write clears it.
3. **State is persisted to `localStorage`** per tab, keyed
   `divvy_state_<tabId>`. A refresh restores exactly where the user left off
   without waiting on the network.
4. **A second device opening the tab URL cold** (no localStorage entry) calls
   `fetchTabState(tabId)` to hydrate from Supabase before the realtime
   subscription takes over (`isLoadingRemote` gates the UI during this).

This means the UI never blocks on Supabase. The tradeoff is that a write can
silently fail (after retries) while the user keeps working locally — hence
the explicit `syncError` banner rather than swallowing the failure.

## Realtime sync

One Supabase Realtime channel per tab (`tab-${tabId}`), subscribed to
`postgres_changes` on `items`, `item_splits`, `participants`, `tabs`. A
second channel per venue (`menu-${venueId}`) syncs `menu_items` so the
inventory pool updates live across devices.

**Deduplication**: writes originating from this device must not be
double-applied when they echo back over the channel. The dedup strategy is
"skip INSERT if the ID is already in local state" — this works because IDs
are generated client-side (`generateId()`) before the write, so the local
optimistic insert always lands first.

**The `item_splits` exception**: this table has no `tab_id` column, so its
channel subscription can't be filtered server-side by tab — it receives
every split INSERT/UPDATE/DELETE in the database and dedups by ID only, with
no item-existence check. This is deliberate, not an oversight: splits and
items are written together, and Postgres logical replication can deliver the
split event before the item event. Filtering split events against "do I know
this item_id yet" would silently drop valid splits in that race. An orphaned
split (item not yet in local state) is harmless — `calculations.ts` ignores
splits whose `item_id` doesn't match a known item — so the safe failure mode
is "briefly ignored, self-corrects" rather than "incorrectly dropped." See
the comment block in `TabContext.tsx` around the `item_splits` INSERT handler.

**Reconnect reconciliation**: if the channel drops (`CHANNEL_ERROR` /
`TIMED_OUT`) and later resubscribes, the full tab state is re-fetched via
`fetchTabState()` and merged into local state, picking up anything missed
while disconnected. Session-only fields (`inventoryItems`, `inventoryLoaded`)
are preserved across this merge since they don't exist in the DB.

**StrictMode double-fire**: `setSplit` builds the new split record (with its
`generateId()` call and the Supabase write) *outside* the `setState` updater,
not inside it. React 18 StrictMode invokes state updaters twice; doing the ID
generation and write inside the updater would generate two different IDs and
fire two inserts, which would then double-count `total_shares` when the
extra insert echoes back as a "foreign" split. Same pattern applies anywhere
else a write needs to happen exactly once per logical mutation.

## Identity — anonymous auth, no signup

- On first load, `ensureSession()` (`src/lib/auth.ts`) either reuses an
  existing Supabase Auth session or calls `signInAnonymously()` to create
  one. This resolves *before* `App.tsx` renders (see `main.tsx`), so
  `getUserId()` is available synchronously everywhere else.
- `tabs.owner_id` stores the creator's anonymous auth user ID. `isCreator` in
  `TabContext` is just `getUserId() === tab.owner_id`.
- Non-creators self-identify via `SelfIdentifyModal` — pick an existing
  participant row or create a new one. The choice is remembered per-device in
  `localStorage` (`divvy_self_<tabId>`), separate from the auth session.
- Ownership is enforced **server-side** via RLS and a trigger (see
  [database.md](database.md)) — not just a client-side convention. This
  replaced an earlier `creator_token`-in-localStorage scheme (see
  `supabase/migration_005_ownership.sql`), which had no DB-level enforcement.

## Data layer separation

`src/lib/db.ts` is the *only* file that imports the Supabase client directly.
All typed queries live there and return plain objects matching
`src/types/entities.ts`. Components and `TabContext` call these functions —
they never touch `supabase` directly. This keeps Supabase swappable in
theory and, more practically, keeps every query's shape in one place.

## Error handling philosophy

There's no global error boundary or toast-everything approach. The two
deliberate signals are:
- `syncError` — surfaced once, generically, when retries are exhausted on a
  *write*.
- Per-page "not found" / loading states for *reads* that come back empty
  (e.g. `Tab.tsx` when `tab` is null and not loading).

Individual `db.ts` functions that aren't on the critical path (avatar
updates, paid-flag toggles, menu item upserts) just `console.error` and
move on rather than surfacing UI — these are non-critical, idempotent, and
will reconcile on the next realtime event or reconnect fetch.
