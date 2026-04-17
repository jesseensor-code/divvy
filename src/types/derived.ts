/**
 * derived.ts
 *
 * Calculated and UI-facing types.
 * These are never stored in the DB — they're computed from entity types.
 */

import type { Item, ItemSplit, Participant, Tab, Venue } from './entities'

/**
 * An item with its splits fully resolved into participant references.
 * `total_shares` is the sum of all splits' shares — needed for cost calculation.
 */
export type ItemWithSplits = Item & {
  splits: Array<ItemSplit & { participant: Participant }>
  total_shares: number
}

/**
 * A single line on a participant's bill breakdown.
 * Tells you exactly what they're paying for a given item and why.
 */
export type ItemCharge = {
  item_id: string
  item_name: string
  shares: number
  total_shares: number
  amount: number    // ZAR, (shares / total_shares) * item.total_price
}

/**
 * Everything one participant owes.
 * This is the core output of the calculation engine.
 *
 * subtotal       → their share of food/drink only
 * tip_amount     → their share of the recommended tip
 * suggested_total → what the creator's tip recommendation says they should pay
 *
 * The "suggested" framing is intentional — participants make their
 * own call when it comes to the actual money changing hands.
 */
export type ParticipantSummary = {
  participant: Participant
  charges: ItemCharge[]
  subtotal: number          // ZAR
  tip_amount: number        // ZAR
  suggested_total: number   // ZAR
}

/**
 * The complete resolved tab — everything needed to render the locked summary view.
 *
 * `unassigned_items` are items that have been added but not yet assigned to anyone.
 * These should be surfaced as warnings before locking a tab.
 */
export type TabSummary = {
  tab: Tab
  venue: Venue
  participants: Participant[]
  items: ItemWithSplits[]
  summaries: ParticipantSummary[]
  grand_subtotal: number    // ZAR, sum of all subtotals
  grand_total: number       // ZAR, sum of all suggested totals (incl. tip)
  unassigned_items: Item[]  // items with no splits — warning before locking
}
