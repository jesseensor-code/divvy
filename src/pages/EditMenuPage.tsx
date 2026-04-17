/**
 * EditMenuPage.tsx
 *
 * /tab/:id/menu — edit the venue's reusable menu items.
 *
 * Lists all inventory items loaded into context.
 * Tap a row to edit name, emoji, price, and category type inline.
 * Tap ✕ to delete the item from both local state and Supabase.
 *
 * Navigating back via the ← header returns to /tab/:id.
 */

import { useState, useRef, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTab, type InventoryItem } from '../context/TabContext'
import { formatRands } from '../lib/currency'

// ─── Toast category options ───────────────────────────────────────────────────
// These keys must match the FUN_TOASTS keys in TableTabView so the stored type
// is used directly for toast lookup instead of keyword-scanning the item name.

const TYPE_OPTIONS = [
  { value: '',         label: 'Auto-detect' },
  { value: 'beer',     label: '🍺  Beer' },
  { value: 'wine',     label: '🍷  Wine' },
  { value: 'cocktail', label: '🍹  Cocktail' },
  { value: 'whisky',   label: '🥃  Whisky' },
  { value: 'gin',      label: '🍸  Gin' },
  { value: 'cider',    label: '🍻  Cider' },
  { value: 'burger',   label: '🍔  Burger' },
  { value: 'steak',    label: '🥩  Steak' },
  { value: 'pizza',    label: '🍕  Pizza' },
  { value: 'nachos',   label: '🧀  Nachos' },
  { value: 'salad',    label: '🥗  Salad' },
  { value: 'chips',    label: '🍟  Chips' },
  { value: 'pasta',    label: '🍝  Pasta' },
  { value: 'coffee',   label: '☕  Coffee' },
  { value: 'water',    label: '💧  Water' },
  { value: 'dessert',  label: '🍰  Dessert' },
  { value: 'sushi',    label: '🍱  Sushi' },
]

// ─── Inline edit row ──────────────────────────────────────────────────────────

function EditRow({ item, onSave, onCancel, onDelete }: {
  item: InventoryItem
  onSave: (patch: Partial<Pick<InventoryItem, 'name' | 'unitPrice' | 'emoji' | 'type'>>) => void
  onCancel: () => void
  onDelete: () => void
}) {
  const [name,  setName]  = useState(item.name)
  const [price, setPrice] = useState(String(item.unitPrice))
  const [emoji, setEmoji] = useState(item.emoji ?? '')
  const [type,  setType]  = useState(item.type ?? '')
  const rowRef = useRef<HTMLDivElement>(null)

  // Cancel on outside tap
  useEffect(() => {
    function handle(e: MouseEvent | TouchEvent) {
      if (rowRef.current && !rowRef.current.contains(e.target as Node)) onCancel()
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle, { passive: true })
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('touchstart', handle)
    }
  }, [onCancel])

  function submit() {
    const p = parseFloat(price)
    if (!name.trim() || isNaN(p) || p <= 0) return
    onSave({
      name: name.trim(),
      unitPrice: p,
      emoji: emoji.trim() || undefined,
      type: type || undefined,
    })
  }

  return (
    <div ref={rowRef} style={s.editRow}>
      <div style={s.editFields}>
        {/* Emoji — single grapheme input */}
        <input
          style={{ ...s.input, width: 48, textAlign: 'center', fontSize: '1.25rem', padding: '0.3rem' }}
          value={emoji}
          onChange={e => setEmoji([...e.target.value].slice(-1).join(''))}
          placeholder="🍽️"
          aria-label="Emoji"
        />
        <input
          style={{ ...s.input, flex: 1, minWidth: 80 }}
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Name"
          autoFocus
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
        <input
          style={{ ...s.input, width: 72 }}
          type="number"
          value={price}
          onChange={e => setPrice(e.target.value)}
          placeholder="R"
          onKeyDown={e => e.key === 'Enter' && submit()}
        />
      </div>
      <div style={s.editFields}>
        <select
          style={{ ...s.input, flex: 1, fontSize: '0.82rem' }}
          value={type}
          onChange={e => setType(e.target.value)}
        >
          {TYPE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <button style={s.saveBtn} onClick={submit}>Save</button>
        <button style={s.cancelBtn} onClick={onCancel}>Cancel</button>
        <button style={s.deleteBtn} onClick={onDelete} title="Delete item">✕</button>
      </div>
    </div>
  )
}

// ─── Display row ──────────────────────────────────────────────────────────────

function DisplayRow({ item, onEdit }: { item: InventoryItem; onEdit: () => void }) {
  const emoji = item.emoji ?? '🍽️'
  const typeLabel = item.type
    ? TYPE_OPTIONS.find(o => o.value === item.type)?.label?.split('  ')[1]
    : null

  return (
    <button style={s.row} onClick={onEdit}>
      <span style={s.rowEmoji}>{emoji}</span>
      <span style={s.rowName}>{item.name}</span>
      {typeLabel && <span style={s.rowType}>{typeLabel}</span>}
      <span style={s.rowPrice}>{formatRands(item.unitPrice)}</span>
      <span style={s.rowChevron}>›</span>
    </button>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function EditMenuPage() {
  const { id } = useParams()
  const { venue, inventoryItems, updateInventoryItem, removeInventoryItem } = useTab()
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <Link to={`/tab/${id}`} style={s.back}>← Back</Link>
        <span style={s.headerTitle}>Edit menu</span>
        <span style={{ width: 56 }} />
      </div>

      {/* Venue label */}
      {venue && <p style={s.venueLabel}>{venue.name}</p>}

      {/* List */}
      {inventoryItems.length === 0 ? (
        <p style={s.empty}>No menu items yet. Add some from the tab.</p>
      ) : (
        <div style={s.list}>
          {inventoryItems.map(item =>
            editingId === item.id
              ? <EditRow
                  key={item.id}
                  item={item}
                  onSave={patch => { updateInventoryItem(item.id, patch); setEditingId(null) }}
                  onCancel={() => setEditingId(null)}
                  onDelete={() => { removeInventoryItem(item.id); setEditingId(null) }}
                />
              : <DisplayRow
                  key={item.id}
                  item={item}
                  onEdit={() => setEditingId(item.id)}
                />
          )}
        </div>
      )}

      {/* Footer hint */}
      <p style={s.hint}>Tap a row to edit. Changes apply immediately.</p>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 480,
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1a1a1a',
    minHeight: '100dvh',
    background: '#fafafa',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.85rem 1.25rem',
    background: 'white',
    borderBottom: '1px solid #f0f0f0',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  back: {
    fontSize: '0.88rem',
    fontWeight: 600,
    color: '#555',
    textDecoration: 'none',
    width: 56,
  },
  headerTitle: {
    fontSize: '0.95rem',
    fontWeight: 700,
  },
  venueLabel: {
    margin: '0.85rem 1.25rem 0.35rem',
    fontSize: '0.7rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.07em',
    color: '#bbb',
  },
  list: {
    margin: '0 1.25rem',
    border: '1.5px solid #e8e8e8',
    borderRadius: 14,
    overflow: 'hidden',
    background: 'white',
  },
  row: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0.7rem 1rem',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid #f5f5f5',
    cursor: 'pointer',
    textAlign: 'left',
  },
  rowEmoji: {
    fontSize: '1.1rem',
    width: 24,
    textAlign: 'center',
    flexShrink: 0,
  },
  rowName: {
    flex: 1,
    fontSize: '0.92rem',
    fontWeight: 600,
    color: '#1a1a1a',
  },
  rowType: {
    fontSize: '0.72rem',
    color: '#bbb',
    fontWeight: 500,
  },
  rowPrice: {
    fontSize: '0.88rem',
    color: '#888',
    fontWeight: 500,
  },
  rowChevron: {
    fontSize: '1rem',
    color: '#ccc',
    flexShrink: 0,
  },
  editRow: {
    padding: '0.65rem 0.9rem',
    background: '#f9f9f9',
    borderBottom: '1px solid #e8e8e8',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  },
  editFields: {
    display: 'flex',
    gap: 6,
    alignItems: 'center',
  },
  input: {
    padding: '0.35rem 0.6rem',
    border: '1.5px solid #d0d0d0',
    borderRadius: 8,
    fontSize: '0.85rem',
    outline: 'none',
    background: 'white',
  },
  saveBtn: {
    padding: '0.35rem 0.75rem',
    background: '#1a1a1a',
    color: 'white',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.82rem',
    fontWeight: 600,
    flexShrink: 0,
  },
  cancelBtn: {
    padding: '0.35rem 0.65rem',
    background: 'none',
    color: '#888',
    border: '1.5px solid #e0e0e0',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.82rem',
    flexShrink: 0,
  },
  deleteBtn: {
    padding: '0.35rem 0.6rem',
    background: 'none',
    color: '#e05252',
    border: '1.5px solid #f0d0d0',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.82rem',
    flexShrink: 0,
  },
  empty: {
    margin: '2rem 1.25rem',
    color: '#bbb',
    fontSize: '0.88rem',
    textAlign: 'center',
  },
  hint: {
    margin: '0.85rem 1.25rem',
    fontSize: '0.75rem',
    color: '#ccc',
    textAlign: 'center',
  },
}
