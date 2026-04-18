/**
 * TabContext.tsx
 *
 * Local state management for a single tab.
 * Local state is the source of truth for the current device — mutations update
 * it immediately (no loading spinners) and also write to Supabase fire-and-forget.
 *
 * Realtime sync:
 *   A single Supabase channel subscribes to postgres_changes on items,
 *   item_splits, participants, and tabs filtered to this tab.  Incoming events
 *   patch local state; writes that originated from this device are deduplicated
 *   by checking whether the record ID is already present in local state.
 *
 * Cold-load (second device opening the URL):
 *   If no localStorage state exists for this tab ID, fetchTabState() hydrates
 *   from Supabase before the subscription starts.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import type { Item, ItemSplit, Participant, Tab, Venue } from '../types/entities'
import {
  upsertMenuItem, deleteMenuItem, upsertParticipant, updateParticipantAvatar,
  updateParticipantPaid, upsertTab, updateTab, upsertItem, deleteItem,
  upsertSplit, deleteSplit, fetchTabState,
} from '../lib/db'
import { supabase } from '../lib/supabase'
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
  type?: string    // category key for toasts — e.g. "beer", "steak"; mirrors menu_items.type
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

// ─── Self identity helpers ────────────────────────────────────────────────────
// When a participant joins via link, they can identify themselves as an existing
// participant (or add themselves as new). This is stored per-tab in localStorage
// so it persists across page refreshes on the same device.

const SELF_KEY = (tabId: string) => `divvy_self_${tabId}`

export function getSelfParticipantId(tabId: string): string | null {
  return localStorage.getItem(SELF_KEY(tabId))
}

export function saveSelfParticipantId(tabId: string, participantId: string) {
  localStorage.setItem(SELF_KEY(tabId), participantId)
}

// ─── Context shape ───────────────────────────────────────────────────────────

type TabContextValue = TabState & {
  // Is the current user the creator of this tab?
  isCreator: boolean

  // True while bootstrapping state from Supabase (cold device load)
  isLoadingRemote: boolean

  // Most recently received item from another device — watched by TableTabView
  // to fire the fun toast. Not persisted to localStorage.
  lastForeignItem: Item | null

  // The participant ID this device has identified as "me" — null if not yet
  // identified or if the user is the creator (who doesn't need to self-identify).
  selfParticipantId: string | null

  // Set by SelfIdentifyModal once the user picks or creates their participant.
  setSelfParticipantId: (participantId: string) => void

  // Create a brand new tab — called from the Home screen
  createTab: (venueName: string, tabName: string, tipPercent: number, mode: 'pub' | 'restaurant') => string

  // Add a participant by name — anyone can do this
  addParticipant: (name: string) => Participant

  // Set (or clear) the avatar for a participant — writes to Supabase immediately
  setParticipantAvatar: (participantId: string, avatarId: number | null) => void

  // Toggle the paid flag — self-serve or creator override
  markParticipantPaid: (participantId: string, paid: boolean) => void

  // Add a line item — anyone can do this
  // emoji is optional and passed through to upsertMenuItem for passive menu building
  addItem: (name: string, totalPrice: number, emoji?: string) => Item

  // Assign shares of an item to a participant
  // If a split already exists for this item+participant, it is replaced
  setSplit: (itemId: string, participantId: string, shares: number) => void

  // Remove a participant's split from an item
  removeSplit: (itemId: string, participantId: string) => void

  // Add an item type to the inventory pool (persists across view switches)
  addInventoryItem: (name: string, unitPrice: number, emoji?: string, type?: string) => InventoryItem

  // Update an inventory item template (name, price, emoji, or type override)
  updateInventoryItem: (id: string, patch: Partial<Pick<InventoryItem, 'name' | 'unitPrice' | 'emoji' | 'type'>>) => void

  // Remove an inventory item from the pool (also deletes from Supabase menu)
  removeInventoryItem: (id: string) => void

  // Update a committed tab line item (name or price)
  updateItem: (id: string, patch: Partial<Pick<Item, 'name' | 'total_price'>>) => void

  // Remove a committed tab line item and all its splits
  removeItem: (id: string) => void

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

function getUrlTabId(): string | null {
  const match = window.location.pathname.match(/\/tab\/([^/]+)/)
  return match ? match[1] : null
}

const EMPTY_STATE: TabState = {
  tab: null, venue: null, participants: [], items: [], splits: [],
  inventoryItems: [], supabaseVenueId: null, inventoryLoaded: false,
}

// ─── Context ─────────────────────────────────────────────────────────────────

const TabContext = createContext<TabContextValue | null>(null)

export function TabProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TabState>(() => loadState() ?? EMPTY_STATE)

  // Not persisted — just for triggering the fun toast on other devices
  const [lastForeignItem, setLastForeignItem] = useState<Item | null>(null)

  // Which participant has this device identified as "me"
  const [selfParticipantId, setSelfParticipantIdState] = useState<string | null>(() => {
    const tabId = getUrlTabId()
    return tabId ? getSelfParticipantId(tabId) : null
  })

  const setSelfParticipantId = useCallback((participantId: string) => {
    setSelfParticipantIdState(participantId)
    if (state.tab) saveSelfParticipantId(state.tab.id, participantId)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tab?.id])

  // True while doing the initial remote fetch on a cold device
  const [isLoadingRemote, setIsLoadingRemote] = useState<boolean>(() => {
    const tabId = getUrlTabId()
    return !!tabId && !loadState()
  })

  const isCreator = state.tab ? isCreatorOfTab(state.tab) : false

  // Persist state on every change so page refresh restores the session
  useEffect(() => { saveState(state) }, [state])

  // ── Persist tab to Supabase ────────────────────────────────────────────────
  // Runs once both state.tab and state.supabaseVenueId are available.
  // Using a ref-based Set so it fires exactly once per tab ID — not on every
  // re-render, and correctly if the same provider somehow sees two different tabs.
  // This sidesteps the stale-closure problem: setSupabaseVenueId is called from
  // Home synchronously in the same event as createTab(), before React commits
  // the new state. A useEffect is the only reliable way to observe both values
  // being set at the same time.

  const tabsWrittenRef = useRef(new Set<string>())
  useEffect(() => {
    if (!state.tab || !state.supabaseVenueId) return
    if (tabsWrittenRef.current.has(state.tab.id)) return
    tabsWrittenRef.current.add(state.tab.id)
    upsertTab(state.tab, state.supabaseVenueId)
  }, [state.tab?.id, state.supabaseVenueId])

  // ── Cold-load bootstrap ────────────────────────────────────────────────────
  // When a second device opens the tab URL, localStorage is empty.
  // Fetch the full tab state from Supabase once, then let realtime take over.

  useEffect(() => {
    if (!isLoadingRemote) return
    const tabId = getUrlTabId()
    if (!tabId) { setIsLoadingRemote(false); return }

    fetchTabState(tabId).then(remote => {
      if (remote) {
        setState({
          tab: remote.tab,
          venue: remote.venue,
          participants: remote.participants,
          items: remote.items,
          splits: remote.splits,
          inventoryItems: [],          // inventory is session-only; fetched from menu on mount
          supabaseVenueId: remote.tab.venue_id,  // DB venue_id IS the Supabase ID
          inventoryLoaded: false,
        })
      }
      setIsLoadingRemote(false)
    })
  // Run once on mount only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Realtime subscription ──────────────────────────────────────────────────
  // One channel per tab, subscribing to all four relevant tables.
  // item_splits has no tab_id column so we filter client-side by known item IDs.
  //
  // Deduplication: on INSERT, skip if the ID is already in local state.
  // This prevents our own fire-and-forget writes from being applied twice.
  //
  // stateRef lets the stable channel callbacks read current state without
  // needing to be recreated whenever state changes.

  const stateRef = useRef(state)
  useEffect(() => { stateRef.current = state }, [state])

  useEffect(() => {
    const tabId = state.tab?.id
    if (!tabId) return

    const channel = supabase
      .channel(`tab-${tabId}`)

      // ── items ──────────────────────────────────────────────────────────────
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'items', filter: `tab_id=eq.${tabId}` },
        payload => {
          const row = payload.new as Item & { total_price: string | number }
          const newItem: Item = { ...row, total_price: Number(row.total_price) }
          // Check foreignness BEFORE setState — stateRef is always current
          const isForeign = !stateRef.current.items.some(i => i.id === row.id)
          setState(s => {
            if (s.items.some(i => i.id === row.id)) return s   // already have it (our own write)
            return { ...s, items: [...s.items, newItem] }
          })
          // setLastForeignItem must be called OUTSIDE setState — calling one setter
          // inside another setter's updater crashes React (blank screen)
          if (isForeign) setLastForeignItem(newItem)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'items', filter: `tab_id=eq.${tabId}` },
        payload => {
          const row = payload.new as Item & { total_price: string | number }
          setState(s => ({
            ...s,
            items: s.items.map(i =>
              i.id === row.id ? { ...row, total_price: Number(row.total_price) } : i
            ),
          }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'items', filter: `tab_id=eq.${tabId}` },
        payload => {
          const id = (payload.old as { id: string }).id
          setState(s => ({
            ...s,
            items: s.items.filter(i => i.id !== id),
            splits: s.splits.filter(sp => sp.item_id !== id),
          }))
        },
      )

      // ── item_splits ────────────────────────────────────────────────────────
      // No tab_id column on item_splits, so we can't filter server-side.
      // We accept all events and dedup by ID only — no item-existence check.
      // Reason: splits and items are written together; the split event can arrive
      // on the other client before the item event due to Postgres replication order.
      // Filtering by known item IDs would silently drop valid splits in that race.
      // Orphan splits (item not yet in state) are harmless — the calculation engine
      // ignores splits whose item_id doesn't match a known item.
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'item_splits' },
        payload => {
          const row = payload.new as ItemSplit
          setState(s => {
            if (s.splits.some(sp => sp.id === row.id)) return s  // dedup only
            return { ...s, splits: [...s.splits, row] }
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'item_splits' },
        payload => {
          const row = payload.new as ItemSplit
          setState(s => ({
            ...s,
            splits: s.splits.some(sp => sp.id === row.id)
              ? s.splits.map(sp => sp.id === row.id ? row : sp)
              : [...s.splits, row],  // insert if we missed the original INSERT event
          }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'item_splits' },
        payload => {
          // Only PK guaranteed in DELETE without REPLICA IDENTITY FULL
          const id = (payload.old as { id: string }).id
          setState(s => ({ ...s, splits: s.splits.filter(sp => sp.id !== id) }))
        },
      )

      // ── participants ───────────────────────────────────────────────────────
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'participants', filter: `tab_id=eq.${tabId}` },
        payload => {
          const row = payload.new as Participant
          setState(s => {
            if (s.participants.some(p => p.id === row.id)) return s
            return {
              ...s,
              participants: [...s.participants, { ...row, avatar_id: row.avatar_id ?? undefined }],
            }
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'participants', filter: `tab_id=eq.${tabId}` },
        payload => {
          const row = payload.new as Participant
          setState(s => ({
            ...s,
            participants: s.participants.map(p =>
              p.id === row.id
                ? { ...row, avatar_id: row.avatar_id ?? undefined, paid: row.paid ?? false }
                : p
            ),
          }))
        },
      )

      // ── tabs ───────────────────────────────────────────────────────────────
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'tabs', filter: `id=eq.${tabId}` },
        payload => {
          const row = payload.new as Tab & { tip_percent: string | number }
          setState(s => s.tab
            ? { ...s, tab: { ...s.tab, tip_percent: Number(row.tip_percent), status: row.status } }
            : s
          )
        },
      )

      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [state.tab?.id])

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
      paid: false,
      created_at: new Date().toISOString(),
    }
    setState(s => ({ ...s, participants: [...s.participants, participant] }))
    upsertParticipant(participant)
    return participant
  }, [state.tab])

  // ── setParticipantAvatar ───────────────────────────────────────────────────

  const setParticipantAvatar = useCallback((participantId: string, avatarId: number | null) => {
    setState(s => ({
      ...s,
      participants: s.participants.map(p =>
        p.id === participantId
          ? { ...p, avatar_id: avatarId ?? undefined }
          : p
      ),
    }))
    updateParticipantAvatar(participantId, avatarId)
  }, [])

  // ── markParticipantPaid ────────────────────────────────────────────────────

  const markParticipantPaid = useCallback((participantId: string, paid: boolean) => {
    setState(s => ({
      ...s,
      participants: s.participants.map(p =>
        p.id === participantId ? { ...p, paid } : p
      ),
    }))
    updateParticipantPaid(participantId, paid)
  }, [])

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
    // Both writes happen outside setState — async side effects must not live in updaters
    upsertItem(item)
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
    // newSplit and upsertSplit must live OUTSIDE setState — the updater runs
    // twice in StrictMode, which would generate two different IDs and fire two
    // DB writes. The first INSERT would then arrive via realtime and be treated
    // as a foreign split (its ID isn't in local state), doubling total_shares
    // and halving everyone's calculated amount.
    const newSplit: ItemSplit = {
      id: generateId(),
      item_id: itemId,
      participant_id: participantId,
      shares,
    }
    upsertSplit(newSplit)
    setState(s => {
      const filtered = s.splits.filter(
        sp => !(sp.item_id === itemId && sp.participant_id === participantId)
      )
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
    deleteSplit(itemId, participantId)
  }, [])

  // ── addInventoryItem ───────────────────────────────────────────────────────

  const addInventoryItem = useCallback((name: string, unitPrice: number, emoji?: string, type?: string): InventoryItem => {
    const item: InventoryItem = {
      id: generateId(),
      name: name.trim(),
      unitPrice,
      ...(emoji ? { emoji } : {}),
      ...(type ? { type } : {}),
    }
    setState(s => ({ ...s, inventoryItems: [...s.inventoryItems, item] }))
    return item
  }, [])

  // ── updateInventoryItem ────────────────────────────────────────────────────

  const updateInventoryItem = useCallback((
    id: string,
    patch: Partial<Pick<InventoryItem, 'name' | 'unitPrice' | 'emoji' | 'type'>>,
  ) => {
    const original = state.inventoryItems.find(inv => inv.id === id)
    if (!original) return
    const updated = { ...original, ...patch }

    setState(s => ({
      ...s,
      inventoryItems: s.inventoryItems.map(inv => inv.id === id ? updated : inv),
      items: s.items.map(item =>
        item.name === original.name && item.total_price === original.unitPrice
          ? { ...item, name: updated.name, total_price: updated.unitPrice }
          : item
      ),
    }))

    if (state.supabaseVenueId) {
      upsertMenuItem(state.supabaseVenueId, updated.name, updated.unitPrice, updated.emoji, updated.type)
    }
  }, [state.inventoryItems, state.supabaseVenueId])

  // ── removeInventoryItem ────────────────────────────────────────────────────

  const removeInventoryItem = useCallback((id: string) => {
    const item = state.inventoryItems.find(inv => inv.id === id)
    if (!item) return
    setState(s => ({ ...s, inventoryItems: s.inventoryItems.filter(inv => inv.id !== id) }))
    if (state.supabaseVenueId) {
      deleteMenuItem(state.supabaseVenueId, item.name)
    }
  }, [state.inventoryItems, state.supabaseVenueId])

  // ── updateItem ─────────────────────────────────────────────────────────────

  const updateItem = useCallback((
    id: string,
    patch: Partial<Pick<Item, 'name' | 'total_price'>>,
  ) => {
    const existing = state.items.find(i => i.id === id)
    if (existing) upsertItem({ ...existing, ...patch })
    setState(s => ({
      ...s,
      items: s.items.map(item => item.id === id ? { ...item, ...patch } : item),
    }))
  }, [state.items])

  // ── removeItem ────────────────────────────────────────────────────────────

  const removeItem = useCallback((id: string) => {
    setState(s => ({
      ...s,
      items: s.items.filter(item => item.id !== id),
      splits: s.splits.filter(sp => sp.item_id !== id),
    }))
    deleteItem(id)   // FK cascade removes splits in DB too
  }, [])

  // ── setSupabaseVenueId ─────────────────────────────────────────────────────
  // Called from Home once upsertVenue resolves.
  // Also triggers the tab write to Supabase — now we have the real venue ID.

  const setSupabaseVenueId = useCallback((id: string) => {
    setState(s => ({ ...s, supabaseVenueId: id }))
  }, [])

  // ── markInventoryLoaded ────────────────────────────────────────────────────

  const markInventoryLoaded = useCallback(() => {
    setState(s => ({ ...s, inventoryLoaded: true }))
  }, [])

  // ── setTipPercent (creator only) ──────────────────────────────────────────

  const setTipPercent = useCallback((percent: number) => {
    if (state.tab) updateTab(state.tab.id, { tip_percent: percent })
    setState(s => s.tab ? { ...s, tab: { ...s.tab, tip_percent: percent } } : s)
  }, [state.tab])

  // ── lockTab (creator only) ────────────────────────────────────────────────

  const lockTab = useCallback(() => {
    if (state.tab) updateTab(state.tab.id, { status: 'locked' })
    setState(s => s.tab ? { ...s, tab: { ...s.tab, status: 'locked' } } : s)
  }, [state.tab])

  return (
    <TabContext.Provider value={{
      ...state,
      isCreator,
      isLoadingRemote,
      lastForeignItem,
      selfParticipantId,
      setSelfParticipantId,
      createTab,
      addParticipant,
      setParticipantAvatar,
      markParticipantPaid,
      addItem,
      setSplit,
      removeSplit,
      addInventoryItem,
      updateInventoryItem,
      removeInventoryItem,
      updateItem,
      removeItem,
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
