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
import type { Venue, MenuItem } from '../types/entities'

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
