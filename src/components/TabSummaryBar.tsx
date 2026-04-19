/**
 * TabSummaryBar.tsx
 *
 * Running tab — inline card component, not a fixed bottom sheet.
 * Shows each participant's suggested total with collapsed accordions.
 * Expand any person to see their full item breakdown.
 */

import { useState } from 'react'
import { formatRands } from '../lib/currency'
import type { TabSummary } from '../types/derived'

type Props = { summary: TabSummary }

export default function TabSummaryBar({ summary }: Props) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (summary.participants.length === 0) return null

  return (
    <div style={s.card}>

      {/* Card header */}
      <div style={s.header}>
        <span style={s.title}>Running tab</span>
        <span style={s.grandTotal}>{formatRands(summary.grand_total)}</span>
      </div>

      <div style={s.divider} />

      {/* Per-person rows */}
      {summary.summaries.map((ps, i) => {
        const isOpen = openId === ps.participant.id
        const isLast = i === summary.summaries.length - 1

        return (
          <div key={ps.participant.id}>
            {/* Summary row — tap to expand */}
            <button
              style={s.personRow}
              onClick={() => setOpenId(isOpen ? null : ps.participant.id)}
            >
              <span style={s.personName}>{ps.participant.name}</span>
              <span style={s.personRight}>
                {ps.charges.length === 0
                  ? <span style={s.nothing}>nothing yet</span>
                  : <span style={s.personTotal}>{formatRands(ps.suggested_total)}</span>
                }
                <span style={s.chevron}>{isOpen ? '▴' : '▾'}</span>
              </span>
            </button>

            {/* Accordion breakdown */}
            {isOpen && ps.charges.length > 0 && (
              <div style={s.breakdown}>
                {groupCharges(ps.charges).map(g => (
                  <div key={g.label} style={s.chargeLine}>
                    <span style={s.chargeName}>{g.label}</span>
                    <span>{formatRands(g.amount)}</span>
                  </div>
                ))}
                <div style={{ ...s.chargeLine, ...s.tipLine }}>
                  <span>Tip ({summary.tab.tip_percent}%)</span>
                  <span>{formatRands(ps.tip_amount)}</span>
                </div>
                <div style={{ ...s.chargeLine, ...s.totalLine }}>
                  <span>Suggested total</span>
                  <span>{formatRands(ps.suggested_total)}</span>
                </div>
              </div>
            )}

            {!isLast && <div style={s.rowDivider} />}
          </div>
        )
      })}

      {/* Unassigned warning */}
      {summary.unassigned_items.length > 0 && (
        <div style={s.warning}>
          ⚠️ {summary.unassigned_items.length} item
          {summary.unassigned_items.length > 1 ? 's' : ''} not assigned yet:{' '}
          {summary.unassigned_items.map(i => i.name).join(', ')}
        </div>
      )}
    </div>
  )
}

// Group same-named charges so "Beer" added 4 times shows as "Beer ×4"
function groupCharges(charges: TabSummary['summaries'][0]['charges']) {
  const map = new Map<string, { label: string; amount: number; count: number }>()
  for (const c of charges) {
    const existing = map.get(c.item_name)
    if (existing) {
      existing.count++
      existing.amount += c.amount
      existing.label = `${c.item_name} ×${existing.count}`
    } else {
      map.set(c.item_name, { label: c.item_name, amount: c.amount, count: 1 })
    }
  }
  return Array.from(map.values())
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  card: {
    margin: '0 1.25rem 2rem',
    border: '1px solid rgba(232,160,48,0.12)',
    borderRadius: 14,
    overflow: 'hidden',
    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
    background: '#1A1410',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.85rem 1rem',
  },
  title: {
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.07em',
    textTransform: 'uppercase',
    color: '#7A6A58',
  },
  grandTotal: {
    fontSize: '1rem',
    fontWeight: 700,
    color: '#F0E8DC',
  },
  divider: {
    height: 1,
    background: 'rgba(232,160,48,0.08)',
  },
  rowDivider: {
    height: 1,
    background: 'rgba(232,160,48,0.05)',
    margin: '0 1rem',
  },
  personRow: {
    width: '100%',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.7rem 1rem',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  personName: {
    fontSize: '0.92rem',
    fontWeight: 600,
    color: '#F0E8DC',
  },
  personRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  personTotal: {
    fontSize: '0.92rem',
    fontWeight: 600,
    color: '#E8A030',
  },
  nothing: {
    fontSize: '0.82rem',
    color: '#4A3A28',
    fontWeight: 400,
  },
  chevron: {
    fontSize: '0.65rem',
    color: '#7A6A58',
  },
  breakdown: {
    padding: '0 1rem 0.75rem 1.75rem',
    display: 'flex',
    flexDirection: 'column',
    gap: 5,
  },
  chargeLine: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.83rem',
    color: '#7A6A58',
  },
  chargeName: {},
  tipLine: {
    color: '#4A3A28',
    borderTop: '1px solid rgba(232,160,48,0.07)',
    paddingTop: 5,
    marginTop: 2,
  },
  totalLine: {
    fontWeight: 700,
    color: '#F0E8DC',
    fontSize: '0.88rem',
  },
  warning: {
    margin: '0 1rem 0.75rem',
    padding: '0.4rem 0.75rem',
    background: 'rgba(232,160,48,0.08)',
    border: '1px solid rgba(232,160,48,0.2)',
    borderRadius: 8,
    fontSize: '0.8rem',
    color: '#E8A030',
  },
}
