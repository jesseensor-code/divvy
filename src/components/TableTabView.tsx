/**
 * TableTabView.tsx
 *
 * Gamified UI: SVG virtual table with participant icons seated around it.
 * Items live in an inventory pool above. Drag or tap to assign.
 *
 * Toast model: toasts appear directly above the person icon they relate to,
 * using SVG coordinates mapped to a position: relative wrapper.
 * Messages are fun, item-specific, and occasionally SA-flavoured.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor,
  useSensor, useSensors, useDroppable, useDraggable,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { useTab, type InventoryItem } from '../context/TabContext'
import { formatRands, parseRands } from '../lib/currency'
import { getMenuItems, upsertMenuItem } from '../lib/db'
import { generateId } from '../lib/utils'
import { itemEmoji, ITEM_EMOJIS } from '../lib/itemEmoji'
import type { Participant } from '../types/entities'

// ─── Layout ───────────────────────────────────────────────────────────────────

const TABLE_W = 320
const TABLE_H = 320
const CX = TABLE_W / 2
const CY = TABLE_H / 2 + 10
const SEAT_RADIUS = 122
const TABLE_RX = 72
const TABLE_RY = 44

// ─── Fun toasts ───────────────────────────────────────────────────────────────

const FUN_TOASTS: Record<string, string[]> = {
  beer:     ['Cheers! 🍺', 'Bottoms up!', 'Slainte!', 'Prost! 🍺', 'Drink up!', 'Get it in!'],
  wine:     ['Salud! 🍷', 'Sip sip hooray!', 'Très chic 🍷', 'Grapes!'],
  cocktail: ['Shaken! 🍸', 'Fancy one!', 'Mixology time'],
  whisky:   ['Neat. 🥃', 'Single or double?', 'Sip slowly...'],
  gin:      ['Tonic! 🍸', 'Botanical!', 'Gin o\'clock'],
  cider:    ['Cheers! 🍻', 'Crispy!', 'Pints up!'],
  burger:   ['Yum! 🍔', 'Get in!', 'Chow down!', 'Lekker burger!', 'Beefy!'],
  steak:    ['Lekker! 🥩', 'Sizzle!', 'Nice cut!', 'Braai vibes 🥩'],
  pizza:    ['Molto bene! 🍕', 'Slice of life!', 'Cheesy!', 'Yum!'],
  nachos:   ['Ole! 🧀', 'Crunch time!', 'Muy bueno!', 'Cheesy goodness'],
  salad:    ['Healthy! 🥗', 'Green queen!', 'Fresh vibes', 'Eat your greens'],
  chips:    ['Crispy! 🍟', 'Lekker!', 'Can\'t stop!'],
  pasta:    ['Molto bene! 🍝', 'Carb up!', 'Mangia!'],
  coffee:   ['Shots! ☕', 'Caffeine fix!', 'Wake up call!', 'Brewing...'],
  water:    ['Hydrated! 💧', 'Smart choice!', 'Stay fresh!', 'H2-woah'],
  dessert:  ['Treat yourself! 🍰', 'You deserve it!', 'Sweet!'],
  cake:     ['Happy days! 🎂', 'Sweet!', 'Indulge!'],
  sushi:    ['Itadakimasu! 🍱', 'Fresh!', 'Chopsticks ready'],
  default:  [
    'Lekker! ✨', 'Enjoy!', 'Sorted!', 'Sharp!', 'Nice!',
    'Eish, yum!', 'Get it!', 'Sho!', 'Yes!', 'Treat!',
    'Love it!', 'Vibes!', 'There we go!', 'Ayy!',
  ],
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function funToast(itemName: string, itemType?: string): string {
  // Prefer the stored type field (exact key lookup) over substring scanning the name
  if (itemType && FUN_TOASTS[itemType]) return pick(FUN_TOASTS[itemType])
  const lower = itemName.toLowerCase()
  for (const [key, msgs] of Object.entries(FUN_TOASTS)) {
    if (key !== 'default' && lower.includes(key)) return pick(msgs)
  }
  return pick(FUN_TOASTS.default)
}

// ─── Seat position ────────────────────────────────────────────────────────────

function seatPosition(index: number, total: number) {
  const startAngle = -Math.PI * 0.85
  const sweep = Math.PI * 1.7
  const angle = total === 1
    ? -Math.PI / 2
    : startAngle + (sweep / (total - 1)) * index
  return {
    x: CX + SEAT_RADIUS * Math.cos(angle),
    y: CY + SEAT_RADIUS * Math.sin(angle),
  }
}

// ─── SVG person icon ──────────────────────────────────────────────────────────

function PersonIcon({ x, y, name, highlighted, isDropTarget }: {
  x: number; y: number; name: string
  highlighted: boolean; isDropTarget: boolean
}) {
  const fill   = isDropTarget ? '#1a1a1a' : highlighted ? '#555' : '#e8e8e8'
  const stroke = isDropTarget || highlighted ? '#1a1a1a' : '#ccc'

  return (
    <g>
      {isDropTarget && (
        <circle cx={x} cy={y - 10} r={30} fill="none"
          stroke="#1a1a1a" strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />
      )}
      {/* Head */}
      <circle cx={x} cy={y - 18} r={13} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {/* Shoulders */}
      <path
        d={`M ${x-18} ${y+14} C ${x-18} ${y-2} ${x-9} ${y-6} ${x} ${y-6} C ${x+9} ${y-6} ${x+18} ${y-2} ${x+18} ${y+14}`}
        fill={fill} stroke={stroke} strokeWidth={1.5}
      />
      {/* Name */}
      <text x={x} y={y + 26} textAnchor="middle"
        style={{ fontSize: '10px', fontWeight: 600, fontFamily: 'system-ui, sans-serif', fill: '#1a1a1a', pointerEvents: 'none' } as React.CSSProperties}>
        {name.length > 8 ? name.slice(0, 7) + '…' : name}
      </text>
    </g>
  )
}

// ─── Droppable seat ───────────────────────────────────────────────────────────

function Seat({ participant, x, y, isDropTarget, highlighted, onTap }: {
  participant: Participant; x: number; y: number
  isDropTarget: boolean; highlighted: boolean; onTap: () => void
}) {
  const { setNodeRef } = useDroppable({ id: `seat-${participant.id}`, data: { participantId: participant.id } })

  return (
    <g ref={setNodeRef as unknown as React.Ref<SVGGElement>} onClick={onTap} style={{ cursor: 'pointer' }}>
      <circle cx={x} cy={y - 8} r={36} fill="transparent" />
      <PersonIcon x={x} y={y} name={participant.name} highlighted={highlighted} isDropTarget={isDropTarget} />
    </g>
  )
}

// ─── Droppable share zone ─────────────────────────────────────────────────────

function ShareZone({ isDropTarget, hasPending, onTap }: {
  isDropTarget: boolean; hasPending: boolean; onTap: () => void
}) {
  const { setNodeRef } = useDroppable({ id: 'share-zone' })

  return (
    <g ref={setNodeRef as unknown as React.Ref<SVGGElement>} onClick={onTap} style={{ cursor: 'pointer' }}>
      <ellipse cx={CX} cy={CY} rx={TABLE_RX} ry={TABLE_RY}
        fill={isDropTarget ? '#f0f0f0' : hasPending ? '#fafafa' : 'white'}
        stroke={isDropTarget ? '#1a1a1a' : hasPending ? '#888' : '#d8d8d8'}
        strokeWidth={isDropTarget ? 2.5 : 1.5}
        strokeDasharray={hasPending ? '4 3' : 'none'}
      />
      <text x={CX} y={CY - 5} textAnchor="middle"
        style={{ fontSize: '11px', fontWeight: 600, fill: hasPending ? '#555' : '#c0c0c0', fontFamily: 'system-ui, sans-serif', pointerEvents: 'none' } as React.CSSProperties}>
        {hasPending ? 'tap people' : 'share'}
      </text>
      <text x={CX} y={CY + 10} textAnchor="middle"
        style={{ fontSize: '9px', fill: '#ccc', fontFamily: 'system-ui, sans-serif', pointerEvents: 'none' } as React.CSSProperties}>
        {hasPending ? 'to split equally' : 'drop to split'}
      </text>
    </g>
  )
}

// ─── Contextual seat toast ────────────────────────────────────────────────────
// Appears above the person icon using SVG-space coordinates mapped to a
// position:relative wrapper div. SVG viewBox 0 0 320 320 = wrapper pixels 1:1.

type SeatToast = { id: string; message: string; x: number; y: number }

function SeatToastBubble({ toast, onDone }: { toast: SeatToast; onDone: () => void }) {
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const t1 = setTimeout(() => setLeaving(true), 1000)
    const t2 = setTimeout(onDone, 1300)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [onDone])

  return (
    <div
      className={leaving ? 'toast-out' : 'toast'}
      style={{
        position: 'absolute',
        left: toast.x,
        top: toast.y - 72,             // above the head
        transform: 'translateX(-50%)',
        background: '#1a1a1a',
        color: 'white',
        padding: '0.35rem 0.85rem',
        borderRadius: 20,
        fontSize: '0.85rem',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        zIndex: 20,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {toast.message}
    </div>
  )
}

// ─── Draggable inventory card ─────────────────────────────────────────────────

function InventoryCard({ item, selected, onTap }: {
  item: InventoryItem; selected: boolean; onTap: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id, data: { item } })
  const emoji = item.emoji ?? itemEmoji(item.name)

  return (
    <div
      ref={setNodeRef}
      style={{
        ...cardStyle,
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        outline: selected ? '2.5px solid #1a1a1a' : 'none',
        outlineOffset: '2px',
        background: selected ? '#f0f0f0' : 'white',
      }}
      {...listeners} {...attributes}
      onClick={onTap}
    >
      <span style={{ fontSize: '1.1rem', lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
      <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#1a1a1a', whiteSpace: 'nowrap' }}>{item.name}</span>
      <span style={{ width: 1, height: 12, background: '#e0e0e0', flexShrink: 0 }} />
      <span style={{ fontSize: '0.7rem', color: '#bbb', whiteSpace: 'nowrap' }}>{formatRands(item.unitPrice)}</span>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'row', alignItems: 'center',
  gap: 6, padding: '7px 10px 7px 12px',
  border: '1.5px solid #e0e0e0', borderRadius: 99,
  background: 'white', cursor: 'grab', userSelect: 'none',
  boxShadow: '0 1px 3px rgba(0,0,0,0.06)', flexShrink: 0,
  // touch-action: none is critical for mobile
  touchAction: 'none',
  willChange: 'transform',
}

// ─── Edit inventory item panel ────────────────────────────────────────────────
// Appears below the inventory row when the ✎ button is tapped.
// All fields are optional — leave blank to keep the current value.

function EditInventoryPanel({ item, onSave, onClose }: {
  item: InventoryItem
  onSave: (patch: Partial<Pick<InventoryItem, 'name' | 'unitPrice' | 'emoji'>>) => void
  onClose: () => void
}) {
  const [name, setName]   = useState(item.name)
  const [price, setPrice] = useState(String(item.unitPrice))
  const [emoji, setEmoji] = useState(item.emoji ?? itemEmoji(item.name))

  function submit() {
    const p = parseFloat(price)
    if (!name.trim() || isNaN(p) || p <= 0) return
    onSave({
      name: name.trim(),
      unitPrice: p,
      emoji: emoji.trim() || undefined,
    })
    onClose()
  }

  return (
    <div style={editPanelStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontWeight: 600, fontSize: '0.88rem' }}>Edit item</span>
        <button style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1rem' }} onClick={onClose}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {/* Emoji picker — single character input; mobile emoji keyboard works here */}
        <input
          style={{ ...miniInput, width: 48, textAlign: 'center', fontSize: '1.3rem', padding: '0.3rem' }}
          value={emoji}
          onChange={e => {
            // Keep only the last grapheme — prevents typing a full word in the emoji field
            const val = [...e.target.value].slice(-1).join('')
            setEmoji(val)
          }}
          aria-label="Emoji"
        />
        <input
          style={{ ...miniInput, flex: 1 }}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <input
          style={{ ...miniInput, width: 72 }}
          type="number"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="R"
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <button style={miniConfirm} onClick={submit}>Save</button>
      </div>
    </div>
  )
}

const editPanelStyle: React.CSSProperties = {
  margin: '0 1.25rem',
  padding: '0.75rem',
  border: '1.5px solid #e8e8e8',
  borderRadius: 12,
  background: 'white',
  boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
}

// ─── Add inventory item ───────────────────────────────────────────────────────

function AddInventoryItem({ onAdd }: { onAdd: (name: string, price: number, emoji: string) => void }) {
  const { supabaseVenueId } = useTab()
  const [active, setActive] = useState(false)
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const nameRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // Collapse and cancel if the user taps anywhere outside the form
  useEffect(() => {
    if (!active) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setActive(false)
        setName('')
        setPrice('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [active])

  function submit() {
    const p = parseRands(price)
    if (!name.trim() || p === null || p <= 0) return
    // Derive the best-match emoji at add time so it's stored immediately —
    // both in local InventoryItem state and in the Supabase menu_items row.
    const emoji = itemEmoji(name.trim())
    onAdd(name, p, emoji)
    if (supabaseVenueId) upsertMenuItem(supabaseVenueId, name.trim(), p, emoji)
    setName(''); setPrice(''); setActive(false)
  }

  if (!active) {
    return (
      <button
        style={{ ...cardStyle, border: '1.5px dashed #ccc', color: '#bbb', background: 'none', boxShadow: 'none', cursor: 'pointer', touchAction: 'auto' }}
        onClick={() => setActive(true)}
      >
        <span style={{ fontSize: '0.9rem' }}>+</span>
        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>Add item</span>
      </button>
    )
  }

  return (
    <div ref={formRef} style={{ display: 'flex', gap: 5, alignItems: 'center', flexWrap: 'wrap', width: '100%' }}>
      {/* autoFocus fires on mount — no setTimeout needed */}
      <input ref={nameRef} style={miniInput} placeholder="Name" value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
      <input style={{ ...miniInput, width: 72 }} placeholder="R" type="number" value={price}
        onChange={e => setPrice(e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} />
      <button style={miniConfirm} onClick={submit}>Add</button>
    </div>
  )
}

// ─── Add person ───────────────────────────────────────────────────────────────

function AddPerson() {
  const { addParticipant } = useTab()
  const [active, setActive] = useState(false)
  const [name, setName] = useState('')
  const formRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!active) return
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (formRef.current && !formRef.current.contains(e.target as Node)) {
        setActive(false)
        setName('')
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [active])

  function submit() {
    if (!name.trim()) return
    addParticipant(name)
    setName(''); setActive(false)
  }

  if (!active) {
    return <button style={addPersonBtn} onClick={() => setActive(true)}>+ Add person to table</button>
  }

  return (
    <div ref={formRef} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input style={miniInput} placeholder="Name" value={name} onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()} autoFocus />
      <button style={miniConfirm} onClick={submit}>Add</button>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

// Approximate height of 3 pill rows (pill ~34px + 8px gap each)
const THREE_ROWS_PX = 120

export default function TableTabView() {
  const { tab, venue, participants, inventoryItems, supabaseVenueId,
          inventoryLoaded, markInventoryLoaded,
          addInventoryItem, addItem, setSplit } = useTab()

  const [activeDragItem, setActiveDragItem] = useState<InventoryItem | null>(null)
  const [tappedItem, setTappedItem]         = useState<InventoryItem | null>(null)
  const [shareZonePending, setShareZonePending] = useState<InventoryItem | null>(null)
  const [shareZonePeople, setShareZonePeople]   = useState<string[]>([])
  const [overId, setOverId] = useState<string | null>(null)

  // Inventory overflow / expand
  const inventoryRef  = useRef<HTMLDivElement>(null)
  const [hasOverflow, setHasOverflow]           = useState(false)
  const [inventoryExpanded, setInventoryExpanded] = useState(false)

  // Multiple toasts can stack (rapid assignments)
  const [toasts, setToasts] = useState<SeatToast[]>([])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    // 250ms hold before a drag activates — long enough to feel intentional on
    // a real thumb, short enough not to feel sluggish. tolerance: 5 means the
    // finger can drift 5px during the hold without cancelling the activation.
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
  )

  // Pre-populate inventory from the venue's saved menu items.
  // Two-layer guard:
  //   loadStartedRef  — synchronous, blocks StrictMode's second effect run
  //                     (state updates haven't propagated yet when it fires)
  //   inventoryLoaded — context boolean, blocks re-fetch after view remount
  //                     (the ref resets on unmount but context survives)
  const loadStartedRef = useRef(false)
  useEffect(() => {
    if (!supabaseVenueId || inventoryLoaded || loadStartedRef.current) return
    loadStartedRef.current = true
    markInventoryLoaded()
    getMenuItems(supabaseVenueId).then(menuItems => {
      menuItems.forEach(mi => {
        addInventoryItem(mi.name, mi.price, mi.emoji ?? undefined, mi.type ?? undefined)
      })
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabaseVenueId, inventoryLoaded])

  // Detect whether inventory overflows past 3 rows.
  // scrollHeight reflects full content height even when overflow:hidden is set,
  // so this works correctly whether the zone is collapsed or expanded.
  useEffect(() => {
    const el = inventoryRef.current
    if (!el) return
    setHasOverflow(el.scrollHeight > THREE_ROWS_PX + 16)
  }, [inventoryItems])


  // Get the SVG-space seat position for a participant
  function getSeatPos(participantId: string) {
    const idx = participants.findIndex(p => p.id === participantId)
    if (idx === -1) return null
    return seatPosition(idx, participants.length)
  }

  function addToast(message: string, x: number, y: number) {
    const id = generateId()
    setToasts(prev => [...prev, { id, message, x, y }])
  }

  function removeToast(id: string) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  function assignToPerson(item: InventoryItem, participantId: string) {
    const emoji = item.emoji ?? itemEmoji(item.name)
    const created = addItem(item.name, item.unitPrice, emoji)
    setSplit(created.id, participantId, 1)
    const pos = getSeatPos(participantId)
    if (pos) addToast(funToast(item.name, item.type), pos.x, pos.y)
  }

  function sendToShareZone(item: InventoryItem) {
    setShareZonePending(item)
    setShareZonePeople([])
    setTappedItem(null)
  }

  function confirmShare() {
    if (!shareZonePending || shareZonePeople.length === 0) return
    const emoji = shareZonePending.emoji ?? itemEmoji(shareZonePending.name)
    const created = addItem(shareZonePending.name, shareZonePending.unitPrice, emoji)
    shareZonePeople.forEach(pid => setSplit(created.id, pid, 1))
    // Toast at each involved person
    shareZonePeople.forEach(pid => {
      const pos = getSeatPos(pid)
      if (pos) addToast(funToast(shareZonePending.name, shareZonePending.type), pos.x, pos.y)
    })
    setShareZonePending(null)
    setShareZonePeople([])
  }

  function toggleSharePerson(participantId: string) {
    setShareZonePeople(prev =>
      prev.includes(participantId) ? prev.filter(id => id !== participantId) : [...prev, participantId]
    )
  }

  function handleTapInventory(item: InventoryItem) {
    setShareZonePending(null)
    setShareZonePeople([])
    setTappedItem(prev => prev?.id === item.id ? null : item)
  }

  function handleTapSeat(participant: Participant) {
    if (shareZonePending) { toggleSharePerson(participant.id); return }
    if (tappedItem) { assignToPerson(tappedItem, participant.id); setTappedItem(null) }
  }

  function handleTapShareZone() {
    if (tappedItem) sendToShareZone(tappedItem)
  }

  const handleDragStart = useCallback((e: DragStartEvent) => {
    setActiveDragItem(e.active.data.current?.item ?? null)
    setTappedItem(null)
    setInventoryExpanded(false) // reclaim screen space while dragging
  }, [])

  const handleDragEnd = useCallback((e: DragEndEvent) => {
    const item: InventoryItem = e.active.data.current?.item
    setActiveDragItem(null); setOverId(null)
    if (!item || !e.over) return
    if (e.over.id === 'share-zone') {
      sendToShareZone(item)
    } else if (typeof e.over.id === 'string' && e.over.id.startsWith('seat-')) {
      const participantId = e.over.data.current?.participantId as string
      if (participantId) assignToPerson(item, participantId)
    }
  }, [participants, addItem, setSplit]) // eslint-disable-line

  // Clean up drag state if the gesture is cancelled (finger lifts mid-air,
  // browser interrupts, etc.) — without this the ghost overlay gets stuck.
  const handleDragCancel = useCallback(() => {
    setActiveDragItem(null)
    setOverId(null)
  }, [])

  if (!tab || !venue) return null

  const seats = participants.map((p, i) => ({ participant: p, ...seatPosition(i, participants.length) }))
  const isItemActive = !!activeDragItem || !!tappedItem
  const activeItemName = activeDragItem?.name ?? tappedItem?.name ?? ''

  return (
    <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      onDragOver={e => setOverId(e.over?.id?.toString() ?? null)}>

      {/* Flex column wrapper — fills the height given by Tab.tsx */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* ── Inventory zone ────────────────────────────────────────────── */}
        <div style={{ padding: '0.65rem 1.25rem 0', borderBottom: '1px solid #f0f0f0', flexShrink: 0 }}>
          <div
            ref={inventoryRef}
            style={{
              display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start',
              maxHeight: inventoryExpanded ? 'none' : THREE_ROWS_PX,
              overflow: 'hidden',
              transition: 'max-height 0.2s ease',
            }}
          >
            {/* Add button first — always visible in row 1, never pushed below fold */}
            <AddInventoryItem onAdd={addInventoryItem} />
            {inventoryItems.map(item => (
              <InventoryCard key={item.id} item={item}
                selected={tappedItem?.id === item.id}
                onTap={() => handleTapInventory(item)} />
            ))}
          </div>

          {/* Expand / collapse arrow — only shown when there are 4+ rows */}
          {hasOverflow && (
            <button
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: '100%', padding: '4px 0 6px',
                background: 'none', border: 'none', cursor: 'pointer',
                color: '#bbb', fontSize: '0.7rem', gap: 4,
              }}
              onClick={() => setInventoryExpanded(p => !p)}
            >
              {inventoryExpanded ? '▲ less' : '▼ more'}
            </button>
          )}
        </div>

        {/* ── Action banner ─────────────────────────────────────────────── */}
        {isItemActive && (
          <div className="pulse" style={{
            padding: '0.45rem 1.25rem', background: '#1a1a1a', color: 'white',
            fontSize: '0.8rem', fontWeight: 600, textAlign: 'center', flexShrink: 0,
          }}>
            {activeDragItem
              ? `Drop "${activeItemName}" onto a person or the share zone`
              : `"${activeItemName}" selected — tap a person or the share zone`
            }
          </div>
        )}

        {/* ── Share zone confirm bar ────────────────────────────────────── */}
        {shareZonePending && !isItemActive && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
            padding: '0.5rem 1.25rem', background: '#f8f8f8',
            borderBottom: '1px solid #ebebeb', flexShrink: 0,
          }}>
            <span style={{ fontSize: '0.85rem', color: '#444', flex: 1 }}>
              Splitting <strong>{shareZonePending.name}</strong>
              {shareZonePeople.length === 0
                ? ' — tap people below'
                : ` between ${shareZonePeople.map(id => participants.find(p => p.id === id)?.name).join(' & ')}`
              }
            </span>
            {shareZonePeople.length > 0 && (
              <button onClick={confirmShare} style={{ padding: '0.35rem 0.85rem', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600 }}>
                Confirm split
              </button>
            )}
            <button onClick={() => { setShareZonePending(null); setShareZonePeople([]) }}
              style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem' }}>
              Cancel
            </button>
          </div>
        )}

        {/* ── SVG table — fills remaining height ───────────────────────── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0.25rem 0 0', overflow: 'hidden' }}>
          <div style={{ position: 'relative', width: TABLE_W, height: TABLE_H, flexShrink: 0 }}>

            <svg width={TABLE_W} height={TABLE_H} viewBox={`0 0 ${TABLE_W} ${TABLE_H}`}
              style={{ overflow: 'visible', display: 'block' }}>
              <ellipse cx={CX} cy={CY + 6} rx={TABLE_RX + 3} ry={TABLE_RY + 3} fill="rgba(0,0,0,0.04)" />
              {seats.map(({ participant, x, y }) => (
                <Seat key={participant.id} participant={participant} x={x} y={y}
                  isDropTarget={overId === `seat-${participant.id}`}
                  highlighted={shareZonePeople.includes(participant.id)}
                  onTap={() => handleTapSeat(participant)} />
              ))}
              <ShareZone isDropTarget={overId === 'share-zone'} hasPending={!!shareZonePending} onTap={handleTapShareZone} />
            </svg>

            {toasts.map(t => (
              <SeatToastBubble key={t.id} toast={t} onDone={() => removeToast(t.id)} />
            ))}
          </div>

          {participants.length === 0 && (
            <p style={{ color: '#ccc', fontSize: '0.85rem', margin: '0.5rem 0 0', textAlign: 'center' }}>
              Add people to see them at the table
            </p>
          )}

          <AddPerson />
        </div>

      </div>{/* end flex column wrapper */}

      <DragOverlay>
        {activeDragItem && (
          <div style={{ ...cardStyle, opacity: 0.95, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', transform: 'scale(1.08)', cursor: 'grabbing' }}>
            <span style={{ fontSize: '1.1rem', lineHeight: 1 }}>{activeDragItem.emoji ?? itemEmoji(activeDragItem.name)}</span>
            <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>{activeDragItem.name}</span>
            <span style={{ width: 1, height: 12, background: '#e0e0e0' }} />
            <span style={{ fontSize: '0.7rem', color: '#bbb' }}>{formatRands(activeDragItem.unitPrice)}</span>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  )
}

// ─── Micro-styles ─────────────────────────────────────────────────────────────


const miniInput: React.CSSProperties = {
  padding: '0.35rem 0.65rem', border: '1.5px solid #d0d0d0',
  borderRadius: 8, fontSize: '0.85rem', outline: 'none', width: 110,
}
const miniConfirm: React.CSSProperties = {
  padding: '0.35rem 0.65rem', background: '#1a1a1a', color: 'white',
  border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: '0.82rem',
}

const addPersonBtn: React.CSSProperties = {
  marginTop: 8, padding: '0.45rem 1rem', border: '1.5px dashed #ccc',
  borderRadius: 20, background: 'none', color: '#aaa', cursor: 'pointer', fontSize: '0.85rem',
}
