import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTab } from '../context/TabContext'
import { buildTabSummary } from '../lib/calculations'
import { formatRands } from '../lib/currency'
import TabSummaryBar from '../components/TabSummaryBar'
import TableTabView from '../components/TableTabView'
import BillModal from '../components/BillModal'
import SelfIdentifyModal from '../components/SelfIdentifyModal'

export default function Tab() {
  const { id } = useParams()
  const { tab, venue, participants, items, splits, isLoadingRemote } = useTab()
  const [showBill, setShowBill] = useState(false)

  if (!tab || !venue) {
    if (isLoadingRemote) {
      return <div style={{ padding: '2rem', color: '#999', fontFamily: 'system-ui' }}>Loading tab…</div>
    }
    return (
      <div style={{ padding: '2rem', fontFamily: 'system-ui' }}>
        <p style={{ color: '#999', marginBottom: '1rem' }}>Tab not found.</p>
        <p style={{ color: '#bbb', fontSize: '0.85rem' }}>
          This tab may not exist yet — ask the creator to share the link again once the tab is set up.
        </p>
        <Link to="/" style={{ fontSize: '0.85rem', color: '#888' }}>← Start a new tab</Link>
      </div>
    )
  }

  const summary = buildTabSummary(tab, venue, participants, items, splits)

  async function handleShare() {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Divvy',
          text: `Join the tab at ${venue!.name}`,
          url,
        })
      } catch { /* user cancelled */ }
    } else {
      // Fallback: copy link to clipboard
      try { await navigator.clipboard.writeText(url) } catch { }
    }
  }

  return (
    <div style={s.page}>

      {/* ── Viewport area ────────────────────────────────────────────────────
          Everything the user needs to play with fits here.
          The full summary breakdown lives below the fold (scroll to see).  */}
      <div style={s.viewport}>

        <div style={s.header}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <p style={s.venue}>{venue.name}</p>
              <Link to={`/tab/${id}/menu`} style={s.editMenuLink}>Edit menu</Link>
            </div>
            <h1 style={s.title}>{tab.name}</h1>
          </div>
          <button style={s.shareBtn} onClick={handleShare}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
              style={{ flexShrink: 0 }}>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
              <polyline points="16 6 12 2 8 6"/>
              <line x1="12" y1="2" x2="12" y2="15"/>
            </svg>
            Invite
          </button>
        </div>

        {/* TableTabView fills remaining space between header and total strip */}
        <div style={s.main}>
          <TableTabView />
        </div>

        {/* Compact total — always visible, tells you where the bill stands */}
        {summary.participants.length > 0 && (
          <div style={s.totalStrip}>
            <span style={s.totalLabel}>Total</span>
            <span style={s.totalAmount}>{formatRands(summary.grand_total)}</span>
            <button style={s.billBtn} onClick={() => setShowBill(true)}>Preview bill</button>
            <Link to={`/tab/${id}/items`} style={s.editTabLink}>Edit tab</Link>
            <span style={s.scrollHint}>↓ breakdown</span>
          </div>
        )}
      </div>

      {/* ── Full breakdown ───────────────────────────────────────────────────
          Below the fold. Scroll down to see per-person totals.            */}
      <TabSummaryBar summary={summary} />

      {/* ── Bill preview modal ───────────────────────────────────────────── */}
      {showBill && (
        <BillModal summary={summary} onClose={() => setShowBill(false)} />
      )}

      {/* ── Self-identification ──────────────────────────────────────────── */}
      <SelfIdentifyModal />

    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 480,
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1a1a1a',
  },
  viewport: {
    height: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.85rem 1.25rem 0.65rem',
    borderBottom: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  venue: {
    margin: 0, fontSize: '0.7rem', color: '#bbb',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  title: { margin: '0.1rem 0 0', fontSize: '1.1rem', fontWeight: 700 },
  shareBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '0 12px', height: 34,
    background: 'none', border: '1.5px solid #e8e8e8',
    borderRadius: 99, cursor: 'pointer', color: '#555',
    fontSize: '0.8rem', fontWeight: 600,
    flexShrink: 0, whiteSpace: 'nowrap',
  },
  main: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  totalStrip: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '0.6rem 1.25rem',
    borderTop: '1px solid #f0f0f0',
    flexShrink: 0,
  },
  totalLabel: {
    fontSize: '0.75rem', fontWeight: 700,
    textTransform: 'uppercase', letterSpacing: '0.07em', color: '#bbb',
  },
  totalAmount: {
    fontSize: '1rem', fontWeight: 700, color: '#1a1a1a', flex: 1,
  },
  scrollHint: {
    fontSize: '0.7rem', color: '#ccc', fontWeight: 500,
  },
  editMenuLink: {
    fontSize: '0.65rem', fontWeight: 700,
    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
    color: '#bbb', textDecoration: 'none',
    padding: '2px 6px', borderRadius: 4,
    border: '1px solid #e8e8e8',
  },
  editTabLink: {
    fontSize: '0.7rem', fontWeight: 600,
    color: '#bbb', textDecoration: 'none',
  },
  billBtn: {
    background: 'none', border: '1.5px solid #e8e8e8',
    borderRadius: 99, padding: '0 9px', height: 26,
    fontSize: '0.7rem', fontWeight: 600, color: '#555',
    cursor: 'pointer', whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },
}
