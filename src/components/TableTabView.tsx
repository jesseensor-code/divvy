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
const CX = TABLE_W / 2  // 160

// Dynamic table sizing based on participant count.
// For 1–4 people: compact layout (default). For 5–7: medium. 8+: large.
// Returns all geometry constants so SVG can be fully responsive.
function tableLayout(participantCount: number) {
  // Scale up the radius so seats don't crowd as numbers grow
  const n = Math.max(1, participantCount)
  const seatRadius = n <= 4 ? 122 : n <= 6 ? 138 : n <= 8 ? 150 : 162
  const tableRX    = n <= 4 ? 80  : n <= 6 ? 90  : n <= 8 ? 100 : 110
  const tableRY    = n <= 4 ? 50  : n <= 6 ? 56  : n <= 8 ? 62  : 68
  // CY shifts up proportionally so the bottom-seat labels don't clip
  const cy         = n <= 4 ? 162 : n <= 6 ? 168 : n <= 8 ? 174 : 180
  // Total SVG height = cy + seatRadius + label room (50px) + some padding
  const tableH     = cy + seatRadius + 60
  return { seatRadius, tableRX, tableRY, cy, tableH }
}

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

function seatPosition(index: number, total: number, seatRadius: number, cy: number) {
  const startAngle = -Math.PI * 0.85
  const sweep = Math.PI * 1.7
  const angle = total === 1
    ? -Math.PI / 2
    : startAngle + (sweep / (total - 1)) * index
  return {
    x: CX + seatRadius * Math.cos(angle),
    y: cy + seatRadius * Math.sin(angle),
  }
}

// ─── Avatar URL helper ────────────────────────────────────────────────────────

function avatarUrl(avatarId: number) {
  return `/avatars/avatar-${String(avatarId).padStart(2, '0')}.webp`
}

// ─── SVG person icon ──────────────────────────────────────────────────────────

const AVATAR_R = 24   // radius in SVG units — 48 px diameter at 1:1 scale

function PersonIcon({ x, y, name, highlighted, isDropTarget, avatarId, participantId, itemCount, isSelf }: {
  x: number; y: number; name: string
  highlighted: boolean; isDropTarget: boolean
  avatarId?: number; participantId: string
  itemCount: number; isSelf: boolean
}) {
  const clipId = `av-clip-${participantId}`
  const cx = x
  const cy = y - 10    // avatar/head centre; shifted up so name sits below with room

  const labelStyle: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif', pointerEvents: 'none',
  }

  if (avatarId) {
    return (
      <g>
        <defs>
          <clipPath id={clipId}>
            <circle cx={cx} cy={cy} r={AVATAR_R} />
          </clipPath>
        </defs>
        {/* Drop-target dashed ring */}
        {isDropTarget && (
          <circle cx={cx} cy={cy} r={AVATAR_R + 10} fill="none"
            stroke="#1a1a1a" strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />
        )}
        {/* Avatar image clipped to circle */}
        <image
          href={avatarUrl(avatarId)}
          x={cx - AVATAR_R} y={cy - AVATAR_R}
          width={AVATAR_R * 2} height={AVATAR_R * 2}
          clipPath={`url(#${clipId})`}
        />
        {/* Highlight ring when selected for share or is drop target */}
        {(highlighted || isDropTarget) && (
          <circle cx={cx} cy={cy} r={AVATAR_R} fill="none"
            stroke="#1a1a1a" strokeWidth={2.5} />
        )}
        {/* Name */}
        <text x={x} y={cy + AVATAR_R + 14} textAnchor="middle"
          style={{ ...labelStyle, fontSize: '11px', fontWeight: 700, fill: '#1a1a1a' }}>
          {name.length > 9 ? name.slice(0, 8) + '…' : name}
        </text>
        {/* Item count */}
        {itemCount > 0 && (
          <text x={x} y={cy + AVATAR_R + 26} textAnchor="middle"
            style={{ ...labelStyle, fontSize: '9px', fill: '#aaa' }}>
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </text>
        )}
        {/* "you" badge */}
        {isSelf && (
          <text x={x} y={cy + AVATAR_R + (itemCount > 0 ? 38 : 38)} textAnchor="middle"
            style={{ ...labelStyle, fontSize: '9px', fontWeight: 700, fill: '#1a1a1a', letterSpacing: '0.04em' }}>
            you
          </text>
        )}
      </g>
    )
  }

  // ── Generic head + shoulders (scaled up to match AVATAR_R footprint) ──────
  const fill   = isDropTarget ? '#1a1a1a' : highlighted ? '#555' : '#e8e8e8'
  const stroke = isDropTarget || highlighted ? '#1a1a1a' : '#ccc'
  const HR = 19   // head radius — was 13

  return (
    <g>
      {isDropTarget && (
        <circle cx={cx} cy={cy} r={AVATAR_R + 10} fill="none"
          stroke="#1a1a1a" strokeWidth={2} strokeDasharray="4 3" opacity={0.5} />
      )}
      {/* Head */}
      <circle cx={cx} cy={cy - 4} r={HR} fill={fill} stroke={stroke} strokeWidth={1.5} />
      {/* Shoulders */}
      <path
        d={`M ${cx-26} ${cy+22} C ${cx-26} ${cy+2} ${cx-13} ${cy-4} ${cx} ${cy-4} C ${cx+13} ${cy-4} ${cx+26} ${cy+2} ${cx+26} ${cy+22}`}
        fill={fill} stroke={stroke} strokeWidth={1.5}
      />
      {/* Name */}
      <text x={x} y={cy + AVATAR_R + 14} textAnchor="middle"
        style={{ ...labelStyle, fontSize: '11px', fontWeight: 700, fill: '#1a1a1a' }}>
        {name.length > 9 ? name.slice(0, 8) + '…' : name}
      </text>
      {/* Item count */}
      {itemCount > 0 && (
        <text x={x} y={cy + AVATAR_R + 26} textAnchor="middle"
          style={{ ...labelStyle, fontSize: '9px', fill: '#aaa' }}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </text>
      )}
      {/* "you" badge */}
      {isSelf && (
        <text x={x} y={cy + AVATAR_R + 38} textAnchor="middle"
          style={{ ...labelStyle, fontSize: '9px', fontWeight: 700, fill: '#1a1a1a', letterSpacing: '0.04em' }}>
          you
        </text>
      )}
    </g>
  )
}

// ─── Droppable seat ───────────────────────────────────────────────────────────

function Seat({ participant, x, y, isDropTarget, highlighted, itemCount, isSelf, onTap }: {
  participant: Participant; x: number; y: number
  isDropTarget: boolean; highlighted: boolean; itemCount: number; isSelf: boolean; onTap: () => void
}) {
  const { setNodeRef } = useDroppable({ id: `seat-${participant.id}`, data: { participantId: participant.id } })

  return (
    <g ref={setNodeRef as unknown as React.Ref<SVGGElement>} onClick={onTap} style={{ cursor: 'pointer' }}>
      {/* Generous hit target */}
      <circle cx={x} cy={y - 10} r={AVATAR_R + 14} fill="transparent" />
      <PersonIcon
        x={x} y={y}
        name={participant.name}
        highlighted={highlighted}
        isDropTarget={isDropTarget}
        avatarId={participant.avatar_id}
        participantId={participant.id}
        itemCount={itemCount}
        isSelf={isSelf}
      />
    </g>
  )
}

// ─── Table + droppable share zone ────────────────────────────────────────────
// The table IS the share zone — drop an item here to split between people.
// Text overlays are shown only when contextually relevant:
//   isItemDragging  → "drop to share"
//   hasPending      → "tap people"
// When idle the table just looks like a table.

const TABLE_FILL      = '#C4965A'   // warm oak
const TABLE_EDGE      = '#9B6E32'   // darker edge / legs
const TABLE_HIGHLIGHT = 'rgba(255,255,255,0.12)'
const LEG_W = 13
const LEG_H = 28

function ShareZone({ isDropTarget, hasPending, isItemDragging, onTap, cy, tableRX, tableRY }: {
  isDropTarget: boolean; hasPending: boolean; isItemDragging: boolean; onTap: () => void
  cy: number; tableRX: number; tableRY: number
}) {
  const { setNodeRef } = useDroppable({ id: 'share-zone' })

  const legY = cy + tableRY - 6   // legs peek out below the table top

  const tableFill = isDropTarget
    ? '#D4A86A'   // lighten on hover
    : hasPending
      ? '#B8874A' // darken when selecting people
      : TABLE_FILL

  const ts: React.CSSProperties = {
    fontFamily: 'system-ui, sans-serif', pointerEvents: 'none',
  }

  return (
    <g ref={setNodeRef as unknown as React.Ref<SVGGElement>} onClick={onTap}
      style={{ cursor: hasPending || isItemDragging ? 'pointer' : 'default' }}>

      {/* Drop shadow */}
      <ellipse cx={CX} cy={cy + 9} rx={tableRX + 5} ry={tableRY + 5}
        fill="rgba(0,0,0,0.10)" />

      {/* Legs — rendered before table top so they appear behind it */}
      <rect x={CX - 30} y={legY} width={LEG_W} height={LEG_H} rx={4} fill={TABLE_EDGE} />
      <rect x={CX + 17} y={legY} width={LEG_W} height={LEG_H} rx={4} fill={TABLE_EDGE} />

      {/* Table top */}
      <ellipse cx={CX} cy={cy} rx={tableRX} ry={tableRY}
        fill={tableFill}
        stroke={TABLE_EDGE}
        strokeWidth={isDropTarget ? 2.5 : 1.5}
        strokeDasharray={hasPending ? '5 3' : 'none'}
      />

      {/* Subtle highlight streak */}
      <ellipse cx={CX - 12} cy={cy - 14} rx={tableRX * 0.5} ry={tableRY * 0.38}
        fill={TABLE_HIGHLIGHT} />

      {/* Context text — only shown when relevant */}
      {isItemDragging && !hasPending && (
        <>
          <text x={CX} y={cy - 4} textAnchor="middle"
            style={{ ...ts, fontSize: '11px', fontWeight: 700, fill: 'rgba(255,255,255,0.9)' }}>
            drop to share
          </text>
          <text x={CX} y={cy + 10} textAnchor="middle"
            style={{ ...ts, fontSize: '9px', fill: 'rgba(255,255,255,0.6)' }}>
            splits equally
          </text>
        </>
      )}
      {hasPending && (
        <>
          <text x={CX} y={cy - 4} textAnchor="middle"
            style={{ ...ts, fontSize: '11px', fontWeight: 700, fill: 'rgba(255,255,255,0.9)' }}>
            tap people
          </text>
          <text x={CX} y={cy + 10} textAnchor="middle"
            style={{ ...ts, fontSize: '9px', fill: 'rgba(255,255,255,0.65)' }}>
            to split equally
          </text>
        </>
      )}
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
    const p = parseRands(price)
    if (!name.trim() || p === null || p <= 0) return
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

// ─── Avatar picker modal ──────────────────────────────────────────────────────
// Opens when a person icon is tapped with no active item — lets anyone pick
// or change that participant's avatar. Writes straight to Supabase.

const AVATAR_COUNT = 20

function AvatarPickerModal({ participant, onClose }: {
  participant: import('../types/entities').Participant
  onClose: () => void
}) {
  const { setParticipantAvatar } = useTab()

  function pick(id: number) {
    setParticipantAvatar(participant.id, id)
    onClose()
  }

  function clear() {
    setParticipantAvatar(participant.id, null)
    onClose()
  }

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '1rem',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Card */}
      <div style={{
        background: 'white', borderRadius: 20,
        padding: '1.25rem 1.25rem 1rem',
        width: '100%', maxWidth: 320,
        boxShadow: '0 16px 48px rgba(0,0,0,0.22)',
        display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '0.88rem', fontWeight: 700, color: '#1a1a1a' }}>
            {participant.name}
          </span>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1.1rem', lineHeight: 1 }}
          >✕</button>
        </div>

        {/* Avatar grid — 4 columns matching source layout */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8,
        }}>
          {Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map(id => {
            const selected = participant.avatar_id === id
            return (
              <button
                key={id}
                onClick={() => pick(id)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 2, borderRadius: '50%',
                  outline: selected ? '2.5px solid #1a1a1a' : '2.5px solid transparent',
                  outlineOffset: 2,
                }}
              >
                <img
                  src={avatarUrl(id)}
                  alt={`Avatar ${id}`}
                  width={56} height={56}
                  style={{ borderRadius: '50%', display: 'block' }}
                />
              </button>
            )
          })}
        </div>

        {/* Clear + Cancel row */}
        <div style={{ display: 'flex', gap: 8, paddingTop: 2 }}>
          {participant.avatar_id && (
            <button
              onClick={clear}
              style={{
                flex: 1, padding: '0.45rem',
                background: 'none', border: '1.5px solid #e8e8e8',
                borderRadius: 10, cursor: 'pointer',
                fontSize: '0.82rem', color: '#888',
              }}
            >
              Remove avatar
            </button>
          )}
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '0.45rem',
              background: '#1a1a1a', color: 'white',
              border: 'none', borderRadius: 10, cursor: 'pointer',
              fontSize: '0.82rem', fontWeight: 600,
            }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
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
  const { tab, venue, participants, items, splits, inventoryItems, supabaseVenueId,
          inventoryLoaded, markInventoryLoaded,
          addInventoryItem, addItem, setSplit, lastForeignAssignment, selfParticipantId } = useTab()

  // Per-participant item count — shown under each person's name
  const itemCountByParticipant: Record<string, number> = {}
  splits.forEach(sp => {
    itemCountByParticipant[sp.participant_id] = (itemCountByParticipant[sp.participant_id] || 0) + 1
  })
  // Suppress unused-variable warning — items is used indirectly via splits
  void items

  const [activeDragItem, setActiveDragItem] = useState<InventoryItem | null>(null)
  const [tappedItem, setTappedItem]         = useState<InventoryItem | null>(null)
  const [avatarPickerFor, setAvatarPickerFor] = useState<import('../types/entities').Participant | null>(null)
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

  // Fire fun toast when another device assigns an item to a participant.
  // lastForeignAssignment is set by the item_splits INSERT realtime handler in
  // TabContext (not the items INSERT) so we always have participant_id available.
  // We position the toast above the assigned person's seat; if we can't find
  // their seat for any reason we fall back to table centre.
  const participantsLengthRef = useRef(participants.length)
  useEffect(() => { participantsLengthRef.current = participants.length }, [participants.length])

  useEffect(() => {
    if (!lastForeignAssignment) return
    const { item, participantId } = lastForeignAssignment
    const pos = getSeatPos(participantId)
    if (pos) {
      addToast(funToast(item.name), pos.x, pos.y)
    } else {
      // Fallback: participant not yet in local state (rare) — show at table centre
      const { cy } = tableLayout(participantsLengthRef.current)
      addToast(funToast(item.name), TABLE_W / 2, cy)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastForeignAssignment])

  // Get the SVG-space seat position for a participant
  function getSeatPos(participantId: string) {
    const idx = participants.findIndex(p => p.id === participantId)
    if (idx === -1) return null
    const { seatRadius: sr, cy } = tableLayout(participants.length)
    return seatPosition(idx, participants.length, sr, cy)
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
    if (tappedItem) { assignToPerson(tappedItem, participant.id); setTappedItem(null); return }
    // Nothing active — open avatar picker for this participant
    setAvatarPickerFor(participant)
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

  const { seatRadius, tableRX, tableRY, cy: tableCY, tableH } = tableLayout(participants.length)
  const seats = participants.map((p, i) => ({ participant: p, ...seatPosition(i, participants.length, seatRadius, tableCY) }))
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
          <div style={{ position: 'relative', width: TABLE_W, height: tableH, flexShrink: 0 }}>

            <svg width={TABLE_W} height={tableH} viewBox={`0 0 ${TABLE_W} ${tableH}`}
              style={{ overflow: 'visible', display: 'block' }}>
              <ellipse cx={CX} cy={tableCY + 6} rx={tableRX + 3} ry={tableRY + 3} fill="rgba(0,0,0,0.04)" />
              {seats.map(({ participant, x, y }) => (
                <Seat key={participant.id} participant={participant} x={x} y={y}
                  isDropTarget={overId === `seat-${participant.id}`}
                  highlighted={shareZonePeople.includes(participant.id)}
                  itemCount={itemCountByParticipant[participant.id] || 0}
                  isSelf={participant.id === selfParticipantId}
                  onTap={() => handleTapSeat(participant)} />
              ))}
              <ShareZone
                isDropTarget={overId === 'share-zone'}
                hasPending={!!shareZonePending}
                isItemDragging={!!activeDragItem}
                onTap={handleTapShareZone}
                cy={tableCY}
                tableRX={tableRX}
                tableRY={tableRY}
              />
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

      {/* Avatar picker — rendered outside the SVG as an HTML overlay */}
      {avatarPickerFor && (
        <AvatarPickerModal
          participant={avatarPickerFor}
          onClose={() => setAvatarPickerFor(null)}
        />
      )}

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
