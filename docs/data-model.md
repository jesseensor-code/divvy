# Data model

Source of truth for types: `src/types/entities.ts` (raw DB rows) and
`src/types/derived.ts` (computed view models). Schema lives in
`supabase/migration_*.sql`.

## Entities and relationships

```
venues ──┬──▶ menu_items   (passive menu, keyed by venue_id + name)
         │
         └──▶ tabs ──┬──▶ participants
                      ├──▶ items ──▶ item_splits ──▶ participants
                      └── (owner_id → auth.users.id)
```

- **`venues`** — just a name. Found-or-created by name (case-insensitive) on
  tab creation (`upsertVenue` in `db.ts`) so repeat visits to the same venue
  share one row.
- **`menu_items`** — a venue's *reusable* item catalogue. Never manually
  managed: every time an item is added to a tab, `upsertMenuItem()` upserts
  it into the venue's menu (keyed on `venue_id, name`), so `price`/`emoji`
  always reflect the most recently observed values. This is what
  pre-populates the inventory pool on a venue's next tab.
- **`tabs`** — one bill-splitting session. The URL slug *is* the tab ID — the
  URL is the session, there's no separate invite code. Has `mode: 'pub' |
  'restaurant'` (currently always `'pub'` — see [views.md](views.md)) and
  `status: 'open' | 'locked'`. `owner_id` ties to `auth.users` for ownership
  (see [database.md](database.md)).
- **`participants`** — a person on the tab. No auth, just a name + optional
  `avatar_id` (1–20, maps to `/avatars/avatar-NN.webp` in `public/`) + `paid`
  flag. Anyone with the tab link can add one.
- **`items`** — a committed line item on the tab. `total_price` is the full
  cost across everyone sharing it; *how* it's divided lives in `item_splits`.
- **`item_splits`** — joins an item to a participant with a `shares` count.
  No `tab_id` column (see [architecture.md](architecture.md) for why that
  matters for realtime).

## The splitting math

A participant's cost for an item is:

```
(participant's shares on that item / total shares on that item) × item.total_price
```

Examples:

| Item | Shares | Result |
|---|---|---|
| Steak R250, Alice only | Alice: 1 | Alice pays R250 |
| Nachos R120, split evenly Alice+Bob | Alice: 1, Bob: 1 | R60 each |
| 7 beers R350, uneven | Alice: 1, Bob: 4, Charlie: 2 | R50 / R200 / R100 |

This is implemented in `src/lib/calculations.ts`, which is **pure** — no
Supabase, no React, just functions over arrays. It's the only place bill
math happens, and the only place that should change if the splitting model
ever changes:

- `resolveItems(items, splits, participants)` — joins raw splits onto items,
  computes `total_shares` per item. Items with zero splits are kept (they
  surface as `unassigned_items`, used to warn before locking a tab).
- `calculateSummaries(tab, participants, resolvedItems)` — per participant:
  which items they're on, their subtotal, their tip (`tab.tip_percent`), and
  their suggested total. A participant with no items still appears, with a
  zero subtotal — they're still on the tab.
- `buildTabSummary(...)` — the entry point. Takes raw DB rows, returns a
  `TabSummary` (defined in `types/derived.ts`) that drives every view: the
  open tab, the locked settlement screen, the share/bill-preview modal.

## Currency rules

- All amounts are **ZAR (South African Rand)**.
- Prices are **VAT-inclusive** — there's no separate tax line anywhere in the
  model.
- Everything rounds to 2 decimal places via the `rands()` helper in
  `calculations.ts` (`Math.round(n * 100) / 100`). Small 1c rounding
  discrepancies between individual shares and the grand total are expected
  and accepted — bill-splitting apps live with this.
- Display formatting (`R` prefix, etc.) is `src/lib/currency.ts`, separate
  from the rounding logic.
