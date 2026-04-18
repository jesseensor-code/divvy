/**
 * LockedTabView.tsx
 *
 * Full-screen view shown to all devices when tab.status === 'locked'.
 * Replaces the interactive table — edits are frozen.
 *
 * Layout:
 *   - Header: venue, tab name, locked badge
 *   - Your card (if self-identified): personal summary + paid toggle
 *   - Everyone else: per-person cards with item breakdown + paid status
 *   - Footer: grand total + settlement progress
 *
 * Permissions:
 *   - Creator: can toggle paid for anyone
 *   - Self-identified participant: can toggle their own paid flag
 *   - Everyone else: read-only
 */

import { useState } from 'react'
import { useTab } from '../context/TabContext'
import { buildTabSummary } from '../lib/calculations'
import { formatRands } from '../lib/currency'
import type { ParticipantSummary } from '../types/derived'

// ─── Avatar helper ────────────────────────────────────────────────────────────

function avatarUrl(avatarId: number) {
  return `/avatars/avatar-${String(avatarId).padStart(2, '0')}.webp`
}

// ─── Group same-named charges ─────────────────────────────────────────────────

function groupCharges(charges: ParticipantSummary['charges']) {
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

// ─── Person card ──────────────────────────────────────────────────────────────

function PersonCard({
  ps,
  isSelf,
  canToggle,
  tipPercent,
  onTogglePaid,
}: {
  ps: ParticipantSummary
  isSelf: boolean
  canToggle: boolean
  tipPercent: number
  onTogglePaid: () => void
}) {
  const [expanded, setExpanded] = useState(isSelf) // self starts open
  const { paid } = ps.participant
  const grouped = groupCharges(ps.charges)

  return (
    <div style={{
      ...s.card,
      ...(isSelf ? s.selfCard : {}),
      ...(paid ? s.paidCard : {}),
    }}>
      {/* Card header */}
      <button
        style={s.cardHeader}
        onClick={() => setExpanded(e => !e)}
      >
        {/* Avatar / initial */}
        <div style={s.avatar}>
          {ps.participant.avatar_id
            ? <img src={avatarUrl(ps.participant.avatar_id)} alt="" width={36} height={36}
                style={{ borderRadius: '50%', display: 'block' }} />
            : <div style={s.avatarFallback}>{ps.participant.name.charAt(0).toUpperCase()}</div>
          }
        </div>

        {/* Name + self label */}
        <div style={s.nameCol}>
          <span style={s.name}>
            {ps.participant.name}
            {isSelf && <span style={s.youBadge}> you</span>}
          </span>
          {ps.charges.length === 0 && (
            <span style={s.nothing}>nothing ordered</span>
          )}
        </div>

        {/* Paid badge OR total */}
        <div style={s.rightCol}>
          {paid ? (
            <span style={s.paidBadge}>✓ paid</span>
          ) : (
            <span style={s.total}>{formatRands(ps.suggested_total)}</span>
          )}
          {ps.charges.length > 0 && (
            <span style={s.chevron}>{expanded ? '▴' : '▾'}</span>
          )}
        </div>
      </button>

      {/* Breakdown accordion */}
      {expanded && ps.charges.length > 0 && (
        <div style={s.breakdown}>
          {grouped.map(g => (
            <div key={g.label} style={s.chargeLine}>
              <span style={s.chargeName}>{g.label}</span>
              <span style={s.chargeAmount}>{formatRands(g.amount)}</span>
            </div>
          ))}
          {tipPercent > 0 && (
            <div style={{ ...s.chargeLine, ...s.tipLine }}>
              <span>Tip ({tipPercent}%)</span>
              <span>{formatRands(ps.tip_amount)}</span>
            </div>
          )}
          <div style={{ ...s.chargeLine, ...s.totalLine }}>
            <span>Total</span>
            <span>{formatRands(ps.suggested_total)}</span>
          </div>
        </div>
      )}

      {/* Pay toggle — only shown to self or creator */}
      {canToggle && ps.charges.length > 0 && (
        <div style={s.payRow}>
          <button
            style={paid ? s.unmarkBtn : s.markBtn}
            onClick={e => { e.stopPropagation(); onTogglePaid() }}
          >
            {paid ? 'Unmark as paid' : 'Mark as paid'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── Main view ────────────────────────────────────────────────────────────────

export default function LockedTabView() {
  const {
    tab, venue, participants, items, splits,
    isCreator, selfParticipantId, markParticipantPaid,
  } = useTab()

  if (!tab || !venue) return null

  const summary = buildTabSummary(tab, venue, participants, items, splits)
  const paidCount = participants.filter(p => p.paid).length
  const totalCount = participants.length

  // Put self at top, then everyone else in order
  const [selfSummary, otherSummaries] = summary.summaries.reduce<
    [ParticipantSummary | null, ParticipantSummary[]]
  >(
    ([self, others], ps) => {
      if (ps.participant.id === selfParticipantId) return [ps, others]
      return [self, [...others, ps]]
    },
    [null, []],
  )

  return (
    <div style={s.page}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div style={s.header}>
        <div>
          <p style={s.venue}>{venue.name}</p>
          <h1 style={s.tabName}>{tab.name}</h1>
        </div>
        <div style={s.lockedBadge}>Tab closed</div>
      </div>

      {/* ── Unassigned items warning ─────────────────────────────────────── */}
      {summary.unassigned_items.length > 0 && (
        <div style={s.warning}>
          ⚠️ {summary.unassigned_items.length} item{summary.unassigned_items.length > 1 ? 's' : ''} weren't assigned:{' '}
          {summary.unassigned_items.map(i => i.name).join(', ')}
        </div>
      )}

      {/* ── Settlement progress bar ──────────────────────────────────────── */}
      {totalCount > 0 && (
        <div style={s.progressWrap}>
          <div style={s.progressBar}>
            <div style={{ ...s.progressFill, width: `${(paidCount / totalCount) * 100}%` }} />
          </div>
          <span style={s.progressLabel}>
            {paidCount === totalCount
              ? '✓ Everyone settled up'
              : `${paidCount} of ${totalCount} paid`}
          </span>
        </div>
      )}

      {/* ── Cards ────────────────────────────────────────────────────────── */}
      <div style={s.cards}>

        {/* Self card first */}
        {selfSummary && (
          <PersonCard
            key={selfSummary.participant.id}
            ps={selfSummary}
            isSelf={true}
            canToggle={true}
            tipPercent={tab.tip_percent}
            onTogglePaid={() =>
              markParticipantPaid(selfSummary.participant.id, !selfSummary.participant.paid)
            }
          />
        )}

        {/* Everyone else (includes all participants when no self-identity is set) */}
        {otherSummaries.map(ps => (
          <PersonCard
            key={ps.participant.id}
            ps={ps}
            isSelf={false}
            canToggle={isCreator}
            tipPercent={tab.tip_percent}
            onTogglePaid={() => markParticipantPaid(ps.participant.id, !ps.participant.paid)}
          />
        ))}
      </div>

      {/* ── Grand total footer ────────────────────────────────────────────── */}
      <div style={s.footer}>
        <span style={s.footerLabel}>Total bill</span>
        <span style={s.footerTotal}>{formatRands(summary.grand_total)}</span>
      </div>

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
    background: '#f7f7f7',
    paddingBottom: '5rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.25rem 0.85rem',
    background: 'white',
    borderBottom: '1px solid #f0f0f0',
  },
  venue: {
    margin: '0 0 2px',
    fontSize: '0.68rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.07em', color: '#bbb',
  },
  tabName: {
    margin: 0, fontSize: '1.1rem', fontWeight: 800,
  },
  lockedBadge: {
    padding: '4px 10px',
    background: '#1a1a1a', color: 'white',
    borderRadius: 99, fontSize: '0.72rem', fontWeight: 700,
    letterSpacing: '0.04em', flexShrink: 0,
  },
  warning: {
    margin: '0.75rem 1.25rem 0',
    padding: '0.5rem 0.85rem',
    background: '#fff8e1', border: '1px solid #ffe58f',
    borderRadius: 10, fontSize: '0.82rem', color: '#b45309',
  },
  progressWrap: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '0.65rem 1.25rem',
  },
  progressBar: {
    flex: 1, height: 4, borderRadius: 99,
    background: '#e8e8e8', overflow: 'hidden',
  },
  progressFill: {
    height: '100%', background: '#1a1a1a',
    borderRadius: 99, transition: 'width 0.4s ease',
  },
  progressLabel: {
    fontSize: '0.72rem', fontWeight: 600, color: '#888',
    whiteSpace: 'nowrap' as const, flexShrink: 0,
  },
  cards: {
    display: 'flex', flexDirection: 'column',
    gap: 10, padding: '0 1.25rem',
  },
  card: {
    background: 'white',
    border: '1.5px solid #e8e8e8',
    borderRadius: 16,
    overflow: 'hidden',
    transition: 'border-color 0.15s',
  },
  selfCard: {
    border: '2px solid #1a1a1a',
  },
  paidCard: {
    opacity: 0.65,
    border: '1.5px solid #d0d0d0',
  },
  cardHeader: {
    width: '100%', display: 'flex', alignItems: 'center',
    gap: 10, padding: '0.75rem 1rem',
    background: 'none', border: 'none', cursor: 'pointer',
    textAlign: 'left' as const,
  },
  avatar: {
    flexShrink: 0, width: 36, height: 36,
  },
  avatarFallback: {
    width: 36, height: 36, borderRadius: '50%',
    background: '#e8e8e8',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: '0.9rem', fontWeight: 700, color: '#555',
  },
  nameCol: {
    flex: 1, display: 'flex', flexDirection: 'column', gap: 1,
  },
  name: {
    fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a',
  },
  youBadge: {
    fontSize: '0.7rem', fontWeight: 800,
    textTransform: 'uppercase' as const, letterSpacing: '0.07em',
    color: '#888',
  },
  nothing: {
    fontSize: '0.75rem', color: '#ccc',
  },
  rightCol: {
    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
  },
  paidBadge: {
    fontSize: '0.75rem', fontWeight: 700,
    color: '#2d8c5f', background: '#e6f7ef',
    padding: '3px 8px', borderRadius: 99,
  },
  total: {
    fontSize: '0.95rem', fontWeight: 700, color: '#1a1a1a',
  },
  chevron: {
    fontSize: '0.62rem', color: '#ccc',
  },
  breakdown: {
    padding: '0 1rem 0.75rem 3.25rem',
    display: 'flex', flexDirection: 'column', gap: 5,
    borderTop: '1px solid #f5f5f5',
  },
  chargeLine: {
    display: 'flex', justifyContent: 'space-between',
    fontSize: '0.83rem', color: '#777',
    paddingTop: 5,
  },
  chargeName: {},
  chargeAmount: {},
  tipLine: {
    color: '#bbb',
    borderTop: '1px solid #f5f5f5',
    marginTop: 2,
  },
  totalLine: {
    fontWeight: 700, color: '#1a1a1a', fontSize: '0.9rem',
  },
  payRow: {
    padding: '0 1rem 0.85rem',
  },
  markBtn: {
    width: '100%', padding: '0.55rem',
    background: '#1a1a1a', color: 'white',
    border: 'none', borderRadius: 10, cursor: 'pointer',
    fontSize: '0.85rem', fontWeight: 700,
  },
  unmarkBtn: {
    width: '100%', padding: '0.55rem',
    background: 'none', color: '#aaa',
    border: '1.5px solid #e0e0e0', borderRadius: 10, cursor: 'pointer',
    fontSize: '0.82rem', fontWeight: 600,
  },
  footer: {
    position: 'fixed', bottom: 0, left: '50%',
    transform: 'translateX(-50%)',
    width: '100%', maxWidth: 480,
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0.85rem 1.25rem',
    background: 'white', borderTop: '1px solid #f0f0f0',
    boxShadow: '0 -4px 16px rgba(0,0,0,0.06)',
  },
  footerLabel: {
    fontSize: '0.75rem', fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: '0.07em', color: '#bbb',
  },
  footerTotal: {
    fontSize: '1.1rem', fontWeight: 800, color: '#1a1a1a',
  },
}
