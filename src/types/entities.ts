/**
 * entities.ts
 *
 * Raw database entity types — one type per table.
 * These mirror the Supabase schema exactly.
 *
 * Monetary values are in South African Rands (ZAR).
 * No tax concept — all prices are VAT-inclusive.
 */

export type Venue = {
  id: string
  name: string
  created_at: string
}

/**
 * A menu item belonging to a venue.
 * Populated passively as items are added to tabs.
 * `price` reflects the most recently observed price.
 */
export type MenuItem = {
  id: string
  venue_id: string
  name: string
  price: number       // ZAR
  emoji?: string      // user-set override; null means use auto-derived emoji
  type?: string       // category key — matches FUN_TOASTS keys, e.g. "beer", "steak"
  updated_at: string
  created_at: string
}

/**
 * A tab is a shared bill session.
 * The URL slug is the tab id — the URL IS the session.
 *
 * creator_token: a UUID generated client-side at tab creation,
 * stored in the user's localStorage. Matched against this field
 * on load to determine if the current user is the creator and
 * should see creator controls (tip setting, locking).
 */
export type Tab = {
  id: string
  venue_id: string
  name: string                  // e.g. "Friday night at Café Caprice"
  tip_percent: number           // e.g. 12.5 for 12.5% — set by creator
  status: 'open' | 'locked'
  mode: 'pub' | 'restaurant'   // determines default view: pub → table, restaurant → classic
  creator_token: string         // UUID, compared against localStorage
  created_at: string
}

/**
 * A person on the tab. No auth — just a name.
 * Anyone with the tab link can add participants.
 */
export type Participant = {
  id: string
  tab_id: string
  name: string
  created_at: string
}

/**
 * A line item on the tab.
 * `total_price` is the full cost of this item across all people sharing it.
 * How that cost is divided is determined by item_splits.
 */
export type Item = {
  id: string
  tab_id: string
  name: string
  total_price: number   // ZAR
  created_at: string
}

/**
 * Connects an item to a participant with a `shares` count.
 *
 * A person's cost for an item = (shares / sum_of_all_shares) * item.total_price
 *
 * Examples:
 *   - Steak R250, Alice only → Alice shares=1 → Alice pays R250
 *   - Nachos R120, Alice + Bob equally → each shares=1 → R60 each
 *   - 7 beers R350, Alice:1 Bob:4 Charlie:2 → R50 / R200 / R100
 */
export type ItemSplit = {
  id: string
  item_id: string
  participant_id: string
  shares: number    // positive integer, defaults to 1
}
