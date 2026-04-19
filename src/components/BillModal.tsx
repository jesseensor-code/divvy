/**
 * BillModal.tsx
 *
 * Receipt-style modal showing the full itemised bill.
 * Opens from the totalStrip on the Tab page.
 * Designed to look like a printed thermal receipt.
 */

import type { TabSummary, ItemWithSplits } from '../types/derived'
import { formatRands } from '../lib/currency'

type Props = {
  summary: TabSummary
  onClose: () => void
}

const DASH = '─'
function dashes(n = 32) { return DASH.repeat(n) }

// Two-column row — used for totals section
function Row({ left, right, bold }: { left: string; right: string; bold?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      gap: 8,
      fontWeight: bold ? 700 : 400,
      lineHeight: 1.5,
    }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {left}
      </span>
      <span style={{ whiteSpace: 'nowrap' }}>{right}</span>
    </div>
  )
}

// Three-column row — used for line items with qty > 1
// left: "Red Wine ×3"   mid: "R50"   right: "R150"
function ItemRow({ name, qty, unitPrice, total }: {
  name: string; qty: number; unitPrice: number; total: number
}) {
  return (
    <div style={{ display: 'flex', gap: 6, lineHeight: 1.5 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}{qty > 1 ? ` ×${qty}` : ''}
      </span>
      {qty > 1 && (
        <span style={{ whiteSpace: 'nowrap', color: '#999' }}>{formatRands(unitPrice)}</span>
      )}
      <span style={{ whiteSpace: 'nowrap' }}>{formatRands(total)}</span>
    </div>
  )
}

// Group items by name + unit price so duplicates are shown as "Beer ×3 R45 R135"
type GroupedItem = { name: string; unitPrice: number; qty: number; total: number }

function groupItems(items: ItemWithSplits[]): GroupedItem[] {
  const map = new Map<string, GroupedItem>()
  for (const item of items) {
    const key = `${item.name.toLowerCase()}__${item.total_price}`
    const existing = map.get(key)
    if (existing) {
      existing.qty++
      existing.total += item.total_price
    } else {
      map.set(key, { name: item.name, unitPrice: item.total_price, qty: 1, total: item.total_price })
    }
  }
  return Array.from(map.values())
}

export default function BillModal({ summary, onClose }: Props) {
  const { tab, venue, items, grand_subtotal, grand_total } = summary
  const grouped = groupItems(items)
  const tipAmount = grand_total - grand_subtotal
  const dateStr = new Date().toLocaleDateString('en-ZA', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
  const timeStr = new Date().toLocaleTimeString('en-ZA', {
    hour: '2-digit', minute: '2-digit',
  })

  return (
    <div style={s.backdrop} onClick={onClose}>
      <div style={s.sheet} onClick={e => e.stopPropagation()}>

        {/* Receipt header */}
        <div style={s.header}>
          <div style={s.venueName}>{venue.name}</div>
          <div style={s.tabName}>{tab.name}</div>
          <div style={s.dateLine}>{dateStr} · {timeStr}</div>
        </div>

        <div style={s.divider}>{dashes()}</div>

        {/* Line items — grouped by name + price */}
        <div style={s.items}>
          {grouped.length === 0 ? (
            <div style={s.emptyNote}>No items on this tab yet.</div>
          ) : (
            grouped.map((g, i) => (
              <ItemRow
                key={i}
                name={g.name}
                qty={g.qty}
                unitPrice={g.unitPrice}
                total={g.total}
              />
            ))
          )}
        </div>

        <div style={s.divider}>{dashes()}</div>

        {/* Totals */}
        <div style={s.totals}>
          <Row left="Subtotal" right={formatRands(grand_subtotal)} />
          <Row
            left={`Tip (${tab.tip_percent}%)`}
            right={formatRands(tipAmount)}
          />
          <div style={{ marginTop: 4 }}>
            <Row left="TOTAL" right={formatRands(grand_total)} bold />
          </div>
        </div>

        <div style={s.divider}>{dashes()}</div>

        {/* Footer */}
        <div style={s.footer}>
          <div>* suggested amounts incl. tip</div>
          <div>powered by Divvy</div>
        </div>

        {/* Close */}
        <button style={s.closeBtn} onClick={onClose}>
          Close
        </button>

      </div>
    </div>
  )
}

const FONT = `'Courier New', Courier, monospace`

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: '1.5rem',
  },
  sheet: {
    background: '#fdfaf5',
    borderRadius: 4,
    padding: '1.5rem 1.4rem 1.2rem',
    fontFamily: FONT,
    fontSize: '0.82rem',
    color: '#1a1a1a',
    width: '100%',
    maxWidth: 340,
    maxHeight: '85dvh',
    overflowY: 'auto',
    boxShadow: '0 4px 32px rgba(0,0,0,0.25)',
    // Subtle torn-edge top feel via dashed border-top
    borderTop: '3px dashed #ccc',
  },
  header: {
    textAlign: 'center',
    marginBottom: '0.75rem',
  },
  venueName: {
    fontSize: '1rem',
    fontWeight: 700,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  tabName: {
    fontSize: '0.78rem',
    color: '#555',
    marginBottom: 4,
  },
  dateLine: {
    fontSize: '0.72rem',
    color: '#888',
  },
  divider: {
    color: '#bbb',
    fontSize: '0.72rem',
    letterSpacing: '-0.5px',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    margin: '0.5rem 0',
  },
  items: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  emptyNote: {
    color: '#999',
    fontStyle: 'italic',
    textAlign: 'center',
    padding: '0.5rem 0',
  },
  totals: {
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  footer: {
    fontSize: '0.68rem',
    color: '#aaa',
    textAlign: 'center',
    lineHeight: 1.7,
    margin: '0.5rem 0 1rem',
  },
  closeBtn: {
    display: 'block',
    width: '100%',
    padding: '0.65rem',
    background: '#1a1a1a',
    color: '#fff',
    border: 'none',
    borderRadius: 4,
    fontFamily: FONT,
    fontSize: '0.82rem',
    fontWeight: 700,
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
}
