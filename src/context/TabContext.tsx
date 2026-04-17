/**
 * TabContext.tsx
 *
 * Local state management for a single tab.
 * This is the data layer for the prototype — everything here will eventually
 * be replaced by Supabase calls, but the shape of the API stays the same.
 *
 * Key design: all mutation functions (addParticipant, addItem, etc.) live here.
 * Components never mutate state directly — they call these functions.
 * This mirrors how a real data layer works and makes the Supabase swap clean.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react'
import type { Item, ItemSplit, Participant, Tab, Venue } from '../types/entities'
import { upsertMenuItem } from '../lib/db'
import { generateId } from '../lib/utils'

// ─── Inventory item ───────────────────────────────────────────────────────────
// An item TYPE available to add to the tab (lives in the venue's menu pool).
// Distinct from Item (which is an assigned bill line). Inventory items are
// templates; each drag/assignment creates a new Item record.

export type InventoryItem = {
  id: string
  name: string
  unitPrice: number
  emoji?: string   // if set, overrides the auto-derived emoji at render time
}

// ─── State shape ─────────────────────────────────────────────────────────────

type TabState = {
  tab: Tab | null
  venue: Venue | null
  participants: Participant[]
  items: Item[]
  splits: ItemSplit[]
  inventoryItems: InventoryItem[]
  // The real Supabase venue ID — set shortly after tab creation once the
  // upsertVenue call resolves. Used for menu item queries and passive writes.
  supabaseVenueId: string | null
  // True once the venue's saved menu has been fetched into inventoryItems.
  // Lives in context (not a component ref) so it survives view switches — the
  // TableTabView can unmount/remount without re-fetching the menu.
  inventoryLoaded: boolean
}

// ─── Context shape ───────────────────────────────────────────────────────────

type TabContextValue = TabState & {
  // Is the current user the creator of this tab?
  isCreator: boolean

  // Create a brand new tab — called from the Home screen
  createTab: (venueName: string, tabName: string, tipPercent: number, mode: 'pub' | 'restaurant') => string

  // Add a participant by name — anyone can do this
  addParticipant: (name: string) => Participant

  // Add a line item — anyone can do this
  // emoji is optional and passed through to upsertMenuItem for passive menu building
  addItem: (name: string, totalPrice: number, emoji?: string) => Item

  // Assign shares of an item to a participant
  // If a split already exists for this item+participant, it is replaced
  setSplit: (itemId: string, participantId: string, shares: number) => void

  // Remove a participant's split from an item
  removeSplit: (itemId: string, participantId: string) => void

  // Add an item type to the inventory pool (persists across view switches)
  addInventoryItem: (name: string, unitPrice: number, emoji?: string) => InventoryItem

  // Update an inventory item template (name, price, or emoji override)
  updateInventoryItem: (id: string, patch: Partial<Pick<InventoryItem, 'name' | 'unitPrice' | 'emoji'>>) => void

  // Update a committed tab line item (name or price)
  updateItem: (id: string, patch: Partial<Pick<Item, 'name' | 'total_price'>>) => void

  // Called from Home once upsertVenue resolves — stores the real Supabase venue ID
  setSupabaseVenueId: (id: string) => void

  // Called by TableTabView after the initial menu fetch completes.
  // Persists in context so remounting the view doesn't re-fetch.
  markInventoryLoaded: () => void

  // Creator only: update the recommended tip percentage
  setTipPercent: (percent: number) => void

  // Creator only: lock the tab (makes it read-only)
  lockTab: () => void
}

// ─── Creator token helpers ────────────────────────────────────────────────────

const CREATOR_KEY = (tabId: string) => `divvy_creator_${tabId}`

function saveCreatorToken(tabId: string, token: string) {
  localStorage.setItem(CREATOR_KEY(tabId), token)
}

function getCreatorToken(tabId: string): string | null {
  return localStorage.getItem(CREATOR_KEY(tabId))
}

function isCreatorOfTab(tab: Tab): boolean {
  return getCreatorToken(tab.id) === tab.creator_token
}

// ─── State persistence ────────────────────────────────────────────────────────
// Saves the full tab state to localStorage on every change so a page refresh
// on an active tab restores exactly where the user left off.
// Key is per-tab so multiple tabs don't collide (future-proofing).

const STATE_KEY = (tabId: string) => `divvy_state_${tabId}`

function saveState(state: TabState) {
  if (!state.tab) return
  localStorage.setItem(STATE_KEY(state.tab.id), JSON.stringify(state))
}

function loadState(): TabState | null {
  // Extract the tab ID from the current URL path (/tab/:id)
  const match = window.location.pathname.match(/\/tab\/([^/]+)/)
  if (!match) return null
  const saved = localStorage.getItem(STATE_KEY(match[1]))
  if (!saved) return null
  try { return JSON.parse(saved) as TabState } catch { return null }
}

const EMPTY_STATE: TabState = {
  tab: null, venue: null, participants: [], items: [], splits: [],
  inventoryItems: [], supabaseVenueId: null, inventoryLoaded: false,
}

// ─── Context ─────────────────────────────────────────────────────────────────

const TabContext = createContext<TabContextValue | null>(null)

export function TabProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TabState>(() => loadState() ?? EMPTY_STATE)

  const isCreator = state.tab ? isCreatorOfTab(state.tab) : false

  // Persist state on every change so page refresh restores the session
  useEffect(() => { saveState(state) }, [state])

  // ── createTab ──────────────────────────────────────────────────────────────

  const createTab = useCallback((
    venueName: string,
    tabName: string,
    tipPercent: number,
    mode: 'pub' | 'restaurant',
  ): string => {
    const tabId = generateId()
    const creatorToken = generateId()
    const now = new Date().toISOString()

    const venue: Venue = {
      id: generateId(),
      name: venueName.trim(),
      created_at: now,
    }

    const tab: Tab = {
      id: tabId,
      venue_id: venue.id,
      name: tabName.trim() || venueName.trim(),
      tip_percent: tipPercent,
      status: 'open',
      mode,
      creator_token: creatorToken,
      created_at: now,
    }

    saveCreatorToken(tabId, creatorToken)

    setState({
      tab,
      venue,
      participants: [],
      items: [],
      splits: [],
      inventoryItems: [],
      supabaseVenueId: null,
      inventoryLoaded: false,
    })

    return tabId
  }, [])

  // ── addParticipant ─────────────────────────────────────────────────────────

  const addParticipant = useCallback((name: string): Participant => {
    const participant: Participant = {
      id: generateId(),
      tab_id: state.tab!.id,
      name: name.trim(),
      created_at: new Date().toISOString(),
    }
    setState(s => ({ ...s, participants: [...s.participants, participant] }))
    return participant
  }, [state.tab])

  // ── addItem ────────────────────────────────────────────────────────────────

  const addItem = useCallback((name: string, totalPrice: number, emoji?: string): Item => {
    const item: Item = {
      id: generateId(),
      tab_id: state.tab!.id,
      name: name.trim(),
      total_price: totalPrice,
      created_at: new Date().toISOString(),
    }
    setState(s => ({ ...s, items: [...s.items, item] }))
    // Fire-and-forget upsert — must live OUTSIDE setState because React can
    // call updater functions multiple times (StrictMode) or defer them,
    // making async side-effects inside updaters unreliable.
    if (state.supabaseVenueId) {
      upsertMenuItem(state.supabaseVenueId, name.trim(), totalPrice, emoji)
    }
    return item
  }, [state.tab, state.supabaseVenueId])

  // ── setSplit ───────────────────────────────────────────────────────────────

  const setSplit = useCallback((
    itemId: string,
    participantId: string,
    shares: number,
  ) => {
    setState(s => {
      const filtered = s.splits.filter(
        sp => !(sp.item_id === itemId && sp.participant_id === participantId)
      )
      const newSplit: ItemSplit = {
        id: generateId(),
        item_id: itemId,
        participant_id: participantId,
        shares,
      }
      return { ...s, splits: [...filtered, newSplit] }
    })
  }, [])

  // ── removeSplit ────────────────────────────────────────────────────────────

  const removeSplit = useCallback((itemId: string, participantId: string) => {
    setState(s => ({
      ...s,
      splits: s.splits.filter(
        sp => !(sp.item_id === itemId && sp.participant_id === participantId)
      ),
    }))
  }, [])

  // ── addInventoryItem ───────────────────────────────────────────────────────

  const addInventoryItem = useCallback((name: string, unitPrice: number, emoji?: string): InventoryItem => {
    const item: InventoryItem = {
      id: generateId(),
      name: name.trim(),
      unitPrice,
      ...(emoji ? { emoji } : {}),
    }
    setState(s => ({ ...s, inventoryItems: [...s.inventoryItems, item] }))
    return item
  }, [])

  // ── updateInventoryItem ────────────────────────────────────────────────────

  const updateInventoryItem = useCallback((
    id: string,
    patch: Partial<Pick<InventoryItem, 'name' | 'unitPrice' | 'emoji'>>,
  ) => {
    // Read originals from closure so we can match already-assigned items below
    const original = state.inventoryItems.find(inv => inv.id === id)
    if (!original) return
    const updated = { ...original, ...patch }

    setState(s => ({
      ...s,
      inventoryItems: s.inventoryItems.map(inv => inv.id === id ? updated : inv),
      // Propagate name/price changes to already-committed tab lines so the
      // running summary stays in sync without requiring a re-assignment.
      items: s.items.map(item =>
        item.name === original.name && item.total_price === original.unitPrice
          ? { ...item, name: updated.name, total_price: updated.unitPrice }
          : item
      ),
    }))

    // Persist outside setState — async side effects must not live in updaters
    if (state.supabaseVenueId) {
      upsertMenuItem(state.supabaseVenueId, updated.name, updated.unitPrice, updated.emoji)
    }
  }, [state.inventoryItems, state.supabaseVenueId])

  // ── updateItem ─────────────────────────────────────────────────────────────

  const updateItem = useCallback((
    id: string,
    patch: Partial<Pick<Item, 'name' | 'total_price'>>,
  ) => {
    setState(s => ({
      ...s,
      items: s.items.map(item =>
        item.id === id ? { ...item, ...patch } : item
      ),
    }))
  }, [])

  // ── setSupabaseVenueId ─────────────────────────────────────────────────────

  const setSupabaseVenueId = useCallback((id: string) => {
    setState(s => ({ ...s, supabaseVenueId: id }))
  }, [])

  // ── markInventoryLoaded ────────────────────────────────────────────────────

  const markInventoryLoaded = useCallback(() => {
    setState(s => ({ ...s, inventoryLoaded: true }))
  }, [])

  // ── setTipPercent (creator only) ──────────────────────────────────────────

  const setTipPercent = useCallback((percent: number) => {
    setState(s => s.tab
      ? { ...s, tab: { ...s.tab, tip_percent: percent } }
      : s
    )
  }, [])

  // ── lockTab (creator only) ────────────────────────────────────────────────

  const lockTab = useCallback(() => {
    setState(s => s.tab
      ? { ...s, tab: { ...s.tab, status: 'locked' } }
      : s
    )
  }, [])

  return (
    <TabContext.Provider value={{
      ...state,
      isCreator,
      createTab,
      addParticipant,
      addItem,
      setSplit,
      removeSplit,
      addInventoryItem,
      updateInventoryItem,
      updateItem,
      setSupabaseVenueId,
      markInventoryLoaded,
      setTipPercent,
      lockTab,
    }}>
      {children}
    </TabContext.Provider>
  )
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useTab(): TabContextValue {
  const ctx = useContext(TabContext)
  if (!ctx) throw new Error('useTab must be used within a TabProvider')
  return ctx
}
