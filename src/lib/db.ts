/**
 * db.ts
 *
 * Typed query functions over Supabase.
 * All functions return plain objects matching the entity types in types/entities.ts.
 *
 * This is the only file that imports supabase — components and context
 * call these functions, keeping Supabase as an implementation detail.
 */

import { supabase } from './supabase'
import type { Venue, MenuItem, Tab, Participant, Item, ItemSplit } from '../types/entities'

// ─── Venues ───────────────────────────────────────────────────────────────────

/**
 * Find venues whose name contains the search string (case-insensitive).
 * Used for autocomplete on the Home screen.
 * Returns up to 8 results ordered by most recently created.
 */
export async function searchVenues(query: string): Promise<Venue[]> {
  let q = supabase
    .from('venues')
    .select('id, name, created_at')
    .order('created_at', { ascending: false })
    .limit(8)
  if (query.trim()) q = q.ilike('name', `%${query}%`)
  const { data, error } = await q
  if (error) { console.error('searchVenues:', error); return [] }
  return data ?? []
}

/**
 * Find or create a venue by exact name (trimmed, case-insensitive match).
 * Called when a tab is created — ensures we don't duplicate venues.
 */
export async function upsertVenue(name: string): Promise<Venue | null> {
  const trimmed = name.trim()
  // Try to find existing first (case-insensitive)
  const { data: existing } = await supabase
    .from('venues')
    .select('id, name, created_at')
    .ilike('name', trimmed)
    .maybeSingle()
  if (existing) return existing

  const { data, error } = await supabase
    .from('venues')
    .insert({ name: trimmed })
    .select('id, name, created_at')
    .single()
  if (error) { console.error('upsertVenue:', error); return null }
  return data
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

/**
 * Persist a tab record to Supabase.
 * Called once from TabContext after the Supabase venue ID has been resolved.
 * Uses the client-generated tab.id as the PK so the URL slug stays stable.
 * supabaseVenueId is passed separately because tab.venue_id is a local placeholder.
 */
export async function upsertTab(tab: Tab, supabaseVenueId: string): Promise<void> {
  const { error } = await supabase
    .from('tabs')
    .upsert({
      id: tab.id,
      venue_id: supabaseVenueId,
      name: tab.name,
      tip_percent: tab.tip_percent,
      status: tab.status,
      mode: tab.mode,
      creator_token: tab.creator_token,
      created_at: tab.created_at,
    }, { onConflict: 'id' })
  if (error) console.error('upsertTab:', error)
}

/**
 * Update mutable tab fields — tip percentage or lock status.
 * Only the creator should call this (enforced in TabContext via isCreator guard).
 */
export async function updateTab(
  tabId: string,
  patch: { tip_percent?: number; status?: string },
): Promise<void> {
  const { error } = await supabase
    .from('tabs')
    .update(patch)
    .eq('id', tabId)
  if (error) console.error('updateTab:', error)
}

// ─── Participants ─────────────────────────────────────────────────────────────

/**
 * Upsert a participant into the participants table.
 * Called when a participant is added to a tab so their record lives in the DB,
 * ready for real-time sync and cross-device avatar reads.
 */
export async function upsertParticipant(participant: Participant): Promise<void> {
  const { error } = await supabase
    .from('participants')
    .upsert({
      id: participant.id,
      tab_id: participant.tab_id,
      name: participant.name,
      avatar_id: participant.avatar_id ?? null,
      created_at: participant.created_at,
    }, { onConflict: 'id' })
  if (error) console.error('upsertParticipant:', error)
}

/**
 * Update only the avatar_id for a participant.
 * Lightweight write — called immediately when a user picks an avatar.
 * Propagates to all connected devices via the realtime subscription.
 */
export async function updateParticipantAvatar(
  participantId: string,
  avatarId: number | null,
): Promise<void> {
  const { error } = await supabase
    .from('participants')
    .update({ avatar_id: avatarId })
    .eq('id', participantId)
  if (error) console.error('updateParticipantAvatar:', error)
}

// ─── Items ────────────────────────────────────────────────────────────────────

/**
 * Upsert a line item.
 * Called on addItem and updateItem — handles both insert and name/price edits.
 */
export async function upsertItem(item: Item): Promise<void> {
  const { error } = await supabase
    .from('items')
    .upsert({
      id: item.id,
      tab_id: item.tab_id,
      name: item.name,
      total_price: item.total_price,
      created_at: item.created_at,
    }, { onConflict: 'id' })
  if (error) console.error('upsertItem:', error)
}

/**
 * Delete a line item.
 * The FK cascade on item_splits means all splits for this item are deleted too.
 */
export async function deleteItem(itemId: string): Promise<void> {
  const { error } = await supabase
    .from('items')
    .delete()
    .eq('id', itemId)
  if (error) console.error('deleteItem:', error)
}

// ─── Item splits ──────────────────────────────────────────────────────────────

/**
 * Upsert a split record.
 * The unique constraint on (item_id, participant_id) means re-assigning
 * the same person updates their shares rather than creating a duplicate row.
 */
export async function upsertSplit(split: ItemSplit): Promise<void> {
  const { error } = await supabase
    .from('item_splits')
    .upsert({
      id: split.id,
      item_id: split.item_id,
      participant_id: split.participant_id,
      shares: split.shares,
    }, { onConflict: 'item_id,participant_id' })
  if (error) console.error('upsertSplit:', error)
}

/**
 * Delete a split by item + participant pair.
 */
export async function deleteSplit(itemId: string, participantId: string): Promise<void> {
  const { error } = await supabase
    .from('item_splits')
    .delete()
    .eq('item_id', itemId)
    .eq('participant_id', participantId)
  if (error) console.error('deleteSplit:', error)
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

/**
 * Full state fetch for a tab — used when a device opens a tab URL cold
 * (no localStorage state) and needs to hydrate from Supabase.
 *
 * Returns null if the tab doesn't exist in the DB yet (e.g. the creator
 * is still on a poor connection and the write hasn't landed).
 */
export async function fetchTabState(tabId: string): Promise<{
  tab: Tab
  venue: Venue
  participants: Participant[]
  items: Item[]
  splits: ItemSplit[]
} | null> {
  // Fetch tab + venue in one query via PostgREST embedding
  const { data: tabRow, error: tabErr } = await supabase
    .from('tabs')
    .select('id, venue_id, name, tip_percent, status, mode, creator_token, created_at, venues(id, name, created_at)')
    .eq('id', tabId)
    .maybeSingle()
  if (tabErr) { console.error('fetchTabState/tab:', tabErr); return null }
  if (!tabRow) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const venueRow = (tabRow as any).venues as Venue
  const tab: Tab = {
    id: tabRow.id,
    venue_id: tabRow.venue_id,
    name: tabRow.name,
    tip_percent: Number(tabRow.tip_percent),
    status: tabRow.status,
    mode: tabRow.mode,
    creator_token: tabRow.creator_token,
    created_at: tabRow.created_at,
  }

  // Fetch participants
  const { data: participantRows, error: pErr } = await supabase
    .from('participants')
    .select('id, tab_id, name, avatar_id, created_at')
    .eq('tab_id', tabId)
    .order('created_at')
  if (pErr) console.error('fetchTabState/participants:', pErr)
  const participants: Participant[] = (participantRows ?? []).map(p => ({
    ...p,
    avatar_id: p.avatar_id ?? undefined,
  }))

  // Fetch items
  const { data: itemRows, error: iErr } = await supabase
    .from('items')
    .select('id, tab_id, name, total_price, created_at')
    .eq('tab_id', tabId)
    .order('created_at')
  if (iErr) console.error('fetchTabState/items:', iErr)
  const items: Item[] = (itemRows ?? []).map(i => ({
    ...i,
    total_price: Number(i.total_price),
  }))

  // Fetch splits for all items in this tab
  let splits: ItemSplit[] = []
  if (items.length > 0) {
    const itemIds = items.map(i => i.id)
    const { data: splitRows, error: sErr } = await supabase
      .from('item_splits')
      .select('id, item_id, participant_id, shares')
      .in('item_id', itemIds)
    if (sErr) console.error('fetchTabState/splits:', sErr)
    splits = splitRows ?? []
  }

  return { tab, venue: venueRow, participants, items, splits }
}

// ─── Menu items ───────────────────────────────────────────────────────────────

/**
 * Fetch all menu items for a venue, ordered by name.
 * Used to pre-populate the inventory in the pub view and suggest items in classic.
 */
export async function getMenuItems(venueId: string): Promise<MenuItem[]> {
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, venue_id, name, price, emoji, type, updated_at, created_at')
    .eq('venue_id', venueId)
    .order('name')
  if (error) { console.error('getMenuItems:', error); return [] }
  return data ?? []
}

/**
 * Search menu items for a venue by name fragment.
 * Used for item-name autocomplete when adding items in the classic view.
 */
export async function searchMenuItems(venueId: string, query: string): Promise<MenuItem[]> {
  if (!query.trim()) return getMenuItems(venueId)
  const { data, error } = await supabase
    .from('menu_items')
    .select('id, venue_id, name, price, emoji, type, updated_at, created_at')
    .eq('venue_id', venueId)
    .ilike('name', `%${query}%`)
    .order('name')
    .limit(10)
  if (error) { console.error('searchMenuItems:', error); return [] }
  return data ?? []
}

/**
 * Upsert a menu item for a venue.
 * Called whenever an item is added to a tab — passively builds the venue's menu.
 * If the item name already exists for this venue, the price (and emoji) is updated
 * to reflect the most recently observed value.
 */
export async function upsertMenuItem(
  venueId: string,
  name: string,
  price: number,
  emoji?: string,
  type?: string,
): Promise<MenuItem | null> {
  // Only include emoji/type in the payload when explicitly provided.
  // Omitting them on conflict means stored values are preserved rather than
  // being overwritten with null (e.g. when an item is added without those fields).
  const payload: Record<string, unknown> = {
    venue_id: venueId,
    name: name.trim(),
    price,
    updated_at: new Date().toISOString(),
  }
  if (emoji !== undefined) payload.emoji = emoji
  if (type !== undefined) payload.type = type

  const { data, error } = await supabase
    .from('menu_items')
    .upsert(payload, { onConflict: 'venue_id,name' })
    .select('id, venue_id, name, price, emoji, type, updated_at, created_at')
    .single()
  if (error) { console.error('upsertMenuItem:', error); return null }
  return data
}

/**
 * Delete a menu item from a venue by name.
 * Called when the venue owner removes an item from the menu entirely.
 */
export async function deleteMenuItem(venueId: string, name: string): Promise<void> {
  const { error } = await supabase
    .from('menu_items')
    .delete()
    .eq('venue_id', venueId)
    .eq('name', name.trim())
  if (error) console.error('deleteMenuItem:', error)
}
