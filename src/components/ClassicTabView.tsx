/**
 * ClassicTabView.tsx
 *
 * Traditional UI: add participants, add items with inline assignment.
 *
 * Add item panel behaviour:
 *   - Fresh add:     name + price + who (equal split, no shares stepper)
 *   - Add again:     price already known → skip it. Just pick who.
 *
 * Multi-person assignment is always equal split (shares=1 each).
 * The running tab handles per-person breakdowns — no need to repeat here.
 */

import { useState, useMemo, useEffect, useRef } from 'react'
import { useTab } from '../context/TabContext'
import { formatRands, parseRands } from '../lib/currency'
import { searchMenuItems } from '../lib/db'
import type { Item, MenuItem, Participant } from '../types/entities'

// ─── Add Participant ──────────────────────────────────────────────────────────

function AddParticipantInline() {
  const { addParticipant } = useTab()
  const [active, setActive] = useState(false)
  const [name, setName] = useState('')

  function submit() {
    if (!name.trim()) return
    addParticipant(name)
    setName('')
    setActive(false)
  }

  if (!active) {
    return (
      <button style={s.ghostBtn} onClick={() => setActive(true)}>
        + Add person
      </button>
    )
  }

  return (
    <div style={s.inlineForm}>
      <input
        style={s.inlineInput}
        placeholder="Name"
        value={name}
        onChange={e => setName(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && submit()}
        autoFocus
      />
      <button style={s.confirmBtn} onClick={submit}>Add</button>
      <button style={s.cancelBtn} onClick={() => { setActive(false); setName('') }}>✕</button>
    </div>
  )
}

// ─── Add Item Panel ───────────────────────────────────────────────────────────

type PanelMode = 'fresh' | 'again'

function AddItemPanel({
  participants,
  mode,
  prefillName,
  prefillPrice,
  onClose,
}: {
  participants: Participant[]
  mode: PanelMode
  prefillName?: string
  prefillPrice?: number
  onClose: () => void
}) {
  const { addItem, setSplit, supabaseVenueId } = useTab()
  const [name, setName] = useState(prefillName ?? '')
  const [priceStr, setPriceStr] = useState(prefillPrice != null ? String(prefillPrice) : '')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')

  // Item name autocomplete
  const [suggestions, setSuggestions] = useState<MenuItem[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const suppressNextSearch = useRef(false)

  useEffect(() => {
    if (mode !== 'fresh') return
    if (suppressNextSearch.current) { suppressNextSearch.current = false; return }
    if (!supabaseVenueId || !name.trim()) { setSuggestions([]); return }
    const t = setTimeout(async () => {
      const results = await searchMenuItems(supabaseVenueId, name)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    }, 200)
    return () => clearTimeout(t)
  }, [name, supabaseVenueId, mode])

  function selectSuggestion(mi: MenuItem) {
    suppressNextSearch.current = true
    setName(mi.name)
    setPriceStr(String(mi.price))
    setSuggestions([])
    setShowSuggestions(false)
    setError('')
  }

  function togglePerson(id: string) {
    setSelected(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
    setError('')
  }

  function submit() {
    const price = mode === 'again' ? prefillPrice! : parseRands(priceStr)
    if (mode === 'fresh' && !name.trim()) return setError('What is the item?')
    if (mode === 'fresh' && (price === null || price <= 0)) return setError('Enter a valid price')
    if (selected.length === 0) return setError('Pick at least one person')

    const item = addItem(name, price as number)
    selected.forEach(pid => setSplit(item.id, pid, 1))
    onClose()
  }

  return (
    <div style={s.panel}>
      <div style={s.panelHeader}>
        <span style={s.panelTitle}>
          {mode === 'again' ? `Add another ${prefillName}` : 'Add item'}
        </span>
        <button style={s.cancelBtn} onClick={onClose}>✕</button>
      </div>

      {/* Name with autocomplete — fresh only */}
      {mode === 'fresh' && (
        <div style={{ position: 'relative' }}>
          <input
            style={s.panelInput}
            placeholder="What is it? (Burger, Nachos…)"
            value={name}
            autoComplete="off"
            onChange={e => { setName(e.target.value); setError('') }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            autoFocus
          />
          {showSuggestions && (
            <ul style={s.dropdown}>
              {suggestions.map(mi => (
                <li
                  key={mi.id}
                  style={s.dropdownItem}
                  onMouseDown={() => selectSuggestion(mi)}
                >
                  <span>{mi.name}</span>
                  <span style={{ color: '#999', fontSize: '0.82rem' }}>{formatRands(mi.price)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Price — fresh only, hidden if filled from suggestion */}
      {mode === 'fresh' && (
        <input
          style={s.panelInput}
          placeholder="Price (R)"
          type="number"
          min="0"
          step="0.01"
          value={priceStr}
          onChange={e => { setPriceStr(e.target.value); setError('') }}
        />
      )}

      {/* Who — always shown */}
      <p style={s.assignLabel}>
        {mode === 'again'
          ? `Who's having a ${prefillName}? (${formatRands(prefillPrice!)} each)`
          : 'Who is this for?'
        }
      </p>
      <div style={s.personGrid}>
        {participants.map(p => {
          const on = selected.includes(p.id)
          return (
            <button
              key={p.id}
              style={{ ...s.personChip, ...(on ? s.personChipActive : {}) }}
              onClick={() => togglePerson(p.id)}
            >
              {p.name}
            </button>
          )
        })}
      </div>

      {selected.length > 1 && (
        <p style={s.splitHint}>
          Cost split equally between {selected.length} people.
        </p>
      )}

      {error && <p style={s.error}>{error}</p>}

      <button style={s.submitBtn} onClick={submit}>
        Add to tab
      </button>
    </div>
  )
}

// ─── Grouped item list ────────────────────────────────────────────────────────

// itemIds: all Item record IDs in this group — needed so updateItem can patch
// every instance when the user edits the group's name or price.
type ItemGroup = { name: string; unitPrice: number; count: number; totalCost: number; itemIds: string[] }

function groupItems(items: Item[]): ItemGroup[] {
  const map = new Map<string, ItemGroup>()
  for (const item of items) {
    const key = `${item.name}||${item.total_price}`
    const g = map.get(key)
    if (g) { g.count++; g.totalCost += item.total_price; g.itemIds.push(item.id) }
    else map.set(key, { name: item.name, unitPrice: item.total_price, count: 1, totalCost: item.total_price, itemIds: [item.id] })
  }
  return Array.from(map.values())
}

// ─── Edit item inline ─────────────────────────────────────────────────────────
// Replaces the item row when the edit button is tapped.
// Editing a group patches every Item record in that group.

function EditItemInline({ group, onSave, onClose }: {
  group: ItemGroup
  onSave: (name: string, unitPrice: number) => void
  onClose: () => void
}) {
  const [name, setName]   = useState(group.name)
  const [price, setPrice] = useState(String(group.unitPrice))

  function submit() {
    const p = parseRands(price)
    if (!name.trim() || p === null || p <= 0) return
    onSave(name.trim(), p)
    onClose()
  }

  return (
    <div style={s.editRow}>
      <input
        style={{ ...s.editInput, flex: 1 }}
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="Name"
        autoFocus
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <input
        style={{ ...s.editInput, width: 80 }}
        type="number"
        value={price}
        onChange={e => setPrice(e.target.value)}
        placeholder="R"
        onKeyDown={e => e.key === 'Enter' && submit()}
      />
      <button style={s.confirmBtn} onClick={submit}>Save</button>
      <button style={s.cancelBtn} onClick={onClose}>✕</button>
    </div>
  )
}

// ─── Main View ────────────────────────────────────────────────────────────────

export default function ClassicTabView() {
  const { tab, venue, participants, items, isCreator, setTipPercent, lockTab, updateItem } = useTab()
  const [panelOpen, setPanelOpen] = useState(false)
  const [prefill, setPrefill] = useState<{ name: string; price: number } | null>(null)
  const [editingGroupKey, setEditingGroupKey] = useState<string | null>(null)

  const grouped = useMemo(() => groupItems(items), [items])

  if (!tab || !venue) return null

  const mode: PanelMode = prefill ? 'again' : 'fresh'

  function openAddAgain(g: ItemGroup) {
    setPrefill({ name: g.name, price: g.unitPrice })
    setPanelOpen(true)
  }

  function closePanel() {
    setPanelOpen(false)
    setPrefill(null)
  }

  return (
    <div style={s.view}>

      {/* Participants */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>People</h2>
        <div style={s.chipRow}>
          {participants.map(p => (
            <span key={p.id} style={s.nameChip}>{p.name}</span>
          ))}
          <AddParticipantInline />
        </div>
      </section>

      {/* Items */}
      <section style={s.section}>
        <h2 style={s.sectionTitle}>Items on the tab</h2>

        {grouped.length > 0 && (
          <div style={s.itemList}>
            {grouped.map(g => {
              const groupKey = `${g.name}-${g.unitPrice}`
              const isEditing = editingGroupKey === groupKey
              return (
                <div key={groupKey}>
                  {isEditing ? (
                    <EditItemInline
                      group={g}
                      onSave={(name, unitPrice) => {
                        g.itemIds.forEach(id => updateItem(id, { name, total_price: unitPrice }))
                      }}
                      onClose={() => setEditingGroupKey(null)}
                    />
                  ) : (
                    <div style={s.itemRow}>
                      <div style={s.itemLeft}>
                        <span style={s.itemName}>
                          {g.name}
                          {g.count > 1 && <span style={s.countBadge}> ×{g.count}</span>}
                        </span>
                        <span style={s.itemTotal}>{formatRands(g.totalCost)}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <button style={s.editItemBtn} onClick={() => setEditingGroupKey(groupKey)} aria-label={`Edit ${g.name}`}>
                          ✎
                        </button>
                        <button style={s.addAgainBtn} onClick={() => openAddAgain(g)}>
                          + Add again
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {grouped.length === 0 && participants.length > 0 && (
          <p style={s.empty}>Nothing on the tab yet.</p>
        )}

        {participants.length === 0 && (
          <p style={s.hint}>Add people first, then start adding items.</p>
        )}

        {!panelOpen && participants.length > 0 && (
          <button style={s.addItemBtn} onClick={() => setPanelOpen(true)}>
            + Add item
          </button>
        )}

        {panelOpen && (
          <AddItemPanel
            participants={participants}
            mode={mode}
            prefillName={prefill?.name}
            prefillPrice={prefill?.price}
            onClose={closePanel}
          />
        )}
      </section>

      {/* Creator controls */}
      {isCreator && (
        <section style={s.section}>
          <h2 style={s.sectionTitle}>Creator controls</h2>
          <div style={s.creatorRow}>
            <label style={s.tipLabel}>Tip</label>
            <div style={s.tipBtns}>
              {[10, 12.5, 15].map(pct => (
                <button
                  key={pct}
                  style={{ ...s.tipBtn, ...(tab.tip_percent === pct ? s.tipBtnActive : {}) }}
                  onClick={() => setTipPercent(pct)}
                >
                  {pct}%
                </button>
              ))}
            </div>
          </div>
          {tab.status === 'open'
            ? <button style={s.lockBtn} onClick={lockTab}>🔒 Lock tab</button>
            : <p style={s.lockedNote}>Tab is locked.</p>
          }
        </section>
      )}
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  view: { padding: '1rem 1.25rem 1.5rem' },
  section: { marginBottom: '1.75rem' },
  sectionTitle: {
    fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: '#aaa', margin: '0 0 0.65rem',
  },
  chipRow: { display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  nameChip: {
    padding: '0.35rem 0.85rem', background: '#f0f0f0',
    borderRadius: 20, fontSize: '0.9rem', fontWeight: 500,
  },
  ghostBtn: {
    padding: '0.35rem 0.85rem', border: '1.5px dashed #ccc',
    borderRadius: 20, background: 'none', fontSize: '0.9rem', color: '#888', cursor: 'pointer',
  },
  inlineForm: { display: 'flex', gap: 6, alignItems: 'center' },
  inlineInput: {
    padding: '0.35rem 0.75rem', border: '1.5px solid #d0d0d0',
    borderRadius: 20, fontSize: '0.9rem', outline: 'none', width: 140,
  },
  confirmBtn: {
    padding: '0.35rem 0.75rem', background: '#1a1a1a', color: 'white',
    border: 'none', borderRadius: 20, cursor: 'pointer', fontSize: '0.85rem',
  },
  cancelBtn: {
    background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '1.1rem', padding: '0 0.25rem',
  },
  empty: { color: '#ccc', fontSize: '0.9rem', margin: '0 0 0.75rem' },
  hint: { color: '#ccc', fontSize: '0.85rem', margin: 0 },
  itemList: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: '0.65rem' },
  itemRow: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.65rem 0.85rem', background: '#fafafa',
    borderRadius: 10, border: '1px solid #f0f0f0',
  },
  itemLeft: { display: 'flex', flexDirection: 'column', gap: 2 },
  itemName: { fontWeight: 600, fontSize: '0.95rem', color: '#1a1a1a' },
  countBadge: { fontWeight: 400, color: '#999', fontSize: '0.9rem' },
  itemTotal: { fontSize: '0.82rem', color: '#aaa' },
  editItemBtn: {
    padding: '0.25rem 0.5rem', border: '1.5px solid #e8e8e8',
    borderRadius: 6, background: 'white', fontSize: '0.78rem',
    color: '#bbb', cursor: 'pointer', lineHeight: 1,
  },
  addAgainBtn: {
    padding: '0.3rem 0.7rem', border: '1.5px solid #e0e0e0',
    borderRadius: 20, background: 'white', fontSize: '0.78rem',
    fontWeight: 600, color: '#666', cursor: 'pointer', whiteSpace: 'nowrap',
  },
  editRow: {
    display: 'flex', gap: 6, alignItems: 'center',
    padding: '0.5rem 0.6rem',
    background: '#fafafa', borderRadius: 10, border: '1px solid #e8e8e8',
  },
  editInput: {
    padding: '0.4rem 0.65rem', border: '1.5px solid #d0d0d0',
    borderRadius: 8, fontSize: '0.9rem', outline: 'none', boxSizing: 'border-box' as const,
  },
  addItemBtn: {
    padding: '0.55rem 1rem', border: '1.5px dashed #ccc',
    borderRadius: 8, background: 'none', fontSize: '0.9rem',
    color: '#aaa', cursor: 'pointer', width: '100%',
  },
  // Autocomplete dropdown
  dropdown: {
    position: 'absolute', top: '100%', left: 0, right: 0,
    background: 'white', border: '1.5px solid #e0e0e0', borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 100,
    listStyle: 'none', margin: '2px 0 0', padding: 0, overflow: 'hidden',
  },
  dropdownItem: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.6rem 0.85rem', cursor: 'pointer', fontSize: '0.9rem',
    borderBottom: '1px solid #f5f5f5',
  },
  // Panel
  panel: {
    border: '1.5px solid #e8e8e8', borderRadius: 12, padding: '1rem',
    marginTop: '0.65rem', display: 'flex', flexDirection: 'column', gap: '0.75rem', background: 'white',
  },
  panelHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  panelTitle: { fontWeight: 600, fontSize: '0.95rem' },
  panelInput: {
    padding: '0.65rem 0.85rem', border: '1.5px solid #d0d0d0',
    borderRadius: 8, fontSize: '0.95rem', outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  assignLabel: { margin: 0, fontWeight: 600, fontSize: '0.88rem', color: '#555' },
  personGrid: { display: 'flex', flexWrap: 'wrap', gap: 8 },
  personChip: {
    padding: '0.4rem 0.9rem', border: '1.5px solid #d0d0d0',
    borderRadius: 20, background: 'white', cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 500, color: '#1a1a1a',
  },
  personChipActive: { background: '#1a1a1a', color: 'white', borderColor: '#1a1a1a' },
  splitHint: { margin: 0, fontSize: '0.78rem', color: '#aaa', lineHeight: 1.4 },
  error: { margin: 0, color: '#d00', fontSize: '0.85rem' },
  submitBtn: {
    padding: '0.75rem', background: '#1a1a1a', color: 'white',
    border: 'none', borderRadius: 10, fontSize: '0.95rem', fontWeight: 600, cursor: 'pointer',
  },
  // Creator
  creatorRow: { display: 'flex', alignItems: 'center', gap: 12, marginBottom: '0.75rem' },
  tipLabel: { fontWeight: 600, fontSize: '0.88rem', color: '#555' },
  tipBtns: { display: 'flex', gap: 6 },
  tipBtn: {
    padding: '0.35rem 0.75rem', border: '1.5px solid #d0d0d0', borderRadius: 20,
    background: 'white', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, color: '#1a1a1a',
  },
  tipBtnActive: { background: '#1a1a1a', color: 'white', borderColor: '#1a1a1a' },
  lockBtn: {
    padding: '0.6rem 1.25rem', background: '#1a1a1a', color: 'white',
    border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem',
  },
  lockedNote: { color: '#aaa', fontSize: '0.85rem', margin: 0 },
}
