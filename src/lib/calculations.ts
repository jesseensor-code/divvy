/**
 * calculations.ts
 *
 * Pure calculation functions — no framework, no side effects.
 * These take raw entity data and produce derived summaries.
 *
 * All monetary arithmetic rounds to 2 decimal places (cents).
 * Small rounding discrepancies (e.g. 1c) are expected and acceptable
 * in a bill-splitting context.
 */

import type { Item, ItemSplit, Participant, Tab, Venue } from '../types/entities'
import type {
  ItemCharge,
  ItemWithSplits,
  ParticipantSummary,
  TabSummary,
} from '../types/derived'

/** Round to 2 decimal places to avoid floating-point drift */
const rands = (n: number): number => Math.round(n * 100) / 100

/**
 * resolveItems
 *
 * Joins raw items with their splits and participant references.
 * Also computes `total_shares` per item (needed for cost calculation).
 *
 * Items with no splits are included — they appear in `unassigned_items`
 * in the TabSummary and should be warned about before locking.
 */
export function resolveItems(
  items: Item[],
  splits: ItemSplit[],
  participants: Participant[]
): ItemWithSplits[] {
  const participantMap = new Map(participants.map(p => [p.id, p]))

  return items.map(item => {
    const itemSplits = splits
      .filter(s => s.item_id === item.id)
      .map(s => ({
        ...s,
        participant: participantMap.get(s.participant_id)!,
      }))

    const total_shares = itemSplits.reduce((sum, s) => sum + s.shares, 0)

    return { ...item, splits: itemSplits, total_shares }
  })
}

/**
 * calculateSummaries
 *
 * For each participant, works out:
 *   - which items they're on and how much they owe for each
 *   - their subtotal (food/drink only)
 *   - their tip based on the creator's recommended tip_percent
 *   - their suggested total
 *
 * Participants with no assigned items will have a zero subtotal
 * and appear in the output — this is intentional (they're still on the tab).
 */
export function calculateSummaries(
  tab: Tab,
  participants: Participant[],
  items: ItemWithSplits[]
): ParticipantSummary[] {
  return participants.map(participant => {
    const charges: ItemCharge[] = []

    for (const item of items) {
      if (item.total_shares === 0) continue   // unassigned item — skip

      const split = item.splits.find(s => s.participant_id === participant.id)
      if (!split) continue                    // this person isn't on this item

      const amount = rands((split.shares / item.total_shares) * item.total_price)

      charges.push({
        item_id: item.id,
        item_name: item.name,
        shares: split.shares,
        total_shares: item.total_shares,
        amount,
      })
    }

    const subtotal = rands(charges.reduce((sum, c) => sum + c.amount, 0))
    const tip_amount = rands(subtotal * (tab.tip_percent / 100))
    const suggested_total = rands(subtotal + tip_amount)

    return { participant, charges, subtotal, tip_amount, suggested_total }
  })
}

/**
 * buildTabSummary
 *
 * The main entry point — assembles everything into a single TabSummary
 * that can drive any view (open tab, locked summary, share screen).
 *
 * Takes raw DB rows as input so callers don't need to pre-join anything.
 */
export function buildTabSummary(
  tab: Tab,
  venue: Venue,
  participants: Participant[],
  items: Item[],
  splits: ItemSplit[]
): TabSummary {
  const resolvedItems = resolveItems(items, splits, participants)
  const summaries = calculateSummaries(tab, participants, resolvedItems)

  // Items that have no splits yet — surface as warnings before locking
  const assignedItemIds = new Set(splits.map(s => s.item_id))
  const unassigned_items = items.filter(i => !assignedItemIds.has(i.id))

  const grand_subtotal = rands(summaries.reduce((sum, s) => sum + s.subtotal, 0))
  const grand_total = rands(summaries.reduce((sum, s) => sum + s.suggested_total, 0))

  return {
    tab,
    venue,
    participants,
    items: resolvedItems,
    summaries,
    grand_subtotal,
    grand_total,
    unassigned_items,
  }
}
