import { useParams } from 'react-router-dom'
import { useTab } from '../context/TabContext'
import { buildTabSummary } from '../lib/calculations'
import TabSummaryBar from '../components/TabSummaryBar'
import TableTabView from '../components/TableTabView'

export default function Tab() {
  const { id } = useParams()
  const { tab, venue, participants, items, splits } = useTab()

  if (!tab || !venue) {
    return <div style={{ padding: '2rem', color: '#999', fontFamily: 'system-ui' }}>Loading tab {id}…</div>
  }

  const summary = buildTabSummary(tab, venue, participants, items, splits)

  return (
    <div style={s.page}>

      {/* Header */}
      <div style={s.header}>
        <p style={s.venue}>{venue.name}</p>
        <h1 style={s.title}>{tab.name}</h1>
      </div>

      <TableTabView />

      {/* Running tab — inline card, scrolls with the page */}
      <TabSummaryBar summary={summary} />

    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 480,
    margin: '0 auto',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    color: '#1a1a1a',
    minHeight: '100dvh',
  },
  header: {
    padding: '1.25rem 1.25rem 0.75rem',
    borderBottom: '1px solid #f0f0f0',
  },
  venue: {
    margin: 0, fontSize: '0.75rem', color: '#bbb',
    fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  title: { margin: '0.15rem 0 0', fontSize: '1.25rem', fontWeight: 700 },
}
