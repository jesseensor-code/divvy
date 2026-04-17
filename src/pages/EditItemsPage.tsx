/**
 * EditItemsPage.tsx
 *
 * /tab/:id/items — review and remove committed tab line items.
 *
 * Use this when something was accidentally added — e.g. a wrong item
 * was dragged onto someone, or a duplicate crept in.
 *
 * Each row shows: item name · price · who it's split with.
 * Tapping ✕ removes the item and all its splits from state.
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useTab } from '../context/TabContext'
import { formatRands } from '../lib/currency'

export default function EditItemsPage() {
  const { id } = useParams()
  const { items, splits, participants, removeItem } = useTab()

  // Track which item is pending confirmation, to prevent accidental deletes
  const [pendingId, setPendingId] = useState<string | null>(null)

  function handleDelete(itemId: string) {
    if (pendingId === itemId) {
      // Second tap: confirm delete
      removeItem(itemId)
      setPendingId(null)
    } else {
      // First tap: arm the button
      setPendingId(itemId)
    }
  }

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <Link to={`/tab/${id}`} style={s.back}>← Back</Link>
        <span style={s.headerTitle}>Edit tab</span>
        <span style={{ width: 56 }} />
      </div>

      {/* Content */}
      {items.length === 0 ? (
        <p style={s.empty}>Nothing on the tab yet.</p>
      ) : (
        <>
          <p style={s.sectionLabel}>{items.length} item{items.length !== 1 ? 's' : ''} on the tab</p>

          <div style={s.list}>
            {items.map((item, idx) => {
              const itemSplits = splits.filter(sp => sp.item_id === item.id)
              const assignedNames = itemSplits
                .map(sp => participants.find(p => p.id === sp.participant_id)?.name)
                .filter((n): n is string => Boolean(n))
              const isPending = pendingId === item.id
              const isLast = idx === items.length - 1

              return (
                <div key={item.id} style={{ ...s.row, borderBottom: isLast ? 'none' : '1px solid #f5f5f5' }}>
                  <div style={s.rowInfo}>
                    <span style={s.rowName}>{item.name}</span>
                    <span style={s.rowMeta}>
                      {formatRands(item.total_price)}
                      {assignedNames.length > 0
                        ? ` · ${assignedNames.join(', ')}`
                        : ' · unassigned'}
                    </span>
                  </div>
                  <button
                    style={{
                      ...s.deleteBtn,
                      ...(isPending ? s.deleteBtnArmed : {}),
                    }}
                    onClick={() => handleDelete(item.id)}
                    onBlur={() => setPendingId(null)}
                  >
                    {isPending ? 'Confirm' : '✕'}
                  </button>
                </div>
              )
            })}
          </div>

          <p style={s.hint}>Tap ✕ once to arm, again to confirm removal.</p>
        </>
      )}
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
  sectionLabel: {
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
    display: 'flex',
    alignItems: 'center',
    padding: '0.7rem 1rem',
    gap: 10,
  },
  rowInfo: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  rowName: {
    fontSize: '0.92rem',
    fontWeight: 600,
    color: '#1a1a1a',
  },
  rowMeta: {
    fontSize: '0.78rem',
    color: '#aaa',
  },
  deleteBtn: {
    padding: '0.3rem 0.65rem',
    background: 'none',
    color: '#ccc',
    border: '1.5px solid #e8e8e8',
    borderRadius: 8,
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 600,
    flexShrink: 0,
    transition: 'all 0.12s ease',
    minWidth: 36,
  },
  deleteBtnArmed: {
    color: '#e05252',
    borderColor: '#f0d0d0',
    background: '#fff8f8',
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
