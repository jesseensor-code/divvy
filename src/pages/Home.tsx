/**
 * Home.tsx
 *
 * Entry point — create a new tab.
 * Venue input has live autocomplete backed by Supabase.
 * Selecting a known venue carries its ID forward so menu items
 * can be pre-loaded on the tab screen.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTab } from '../context/TabContext'
import { searchVenues, upsertVenue } from '../lib/db'
import type { Venue } from '../types/entities'

const TIP_PRESETS = [10, 12.5, 15]

export default function Home() {
  const { createTab, setSupabaseVenueId } = useTab()
  const navigate = useNavigate()

  const [venue, setVenue] = useState('')
  const [label, setLabel] = useState('')
  const [tip, setTip] = useState<number>(12.5)
  const [customTip, setCustomTip] = useState('')
  const [useCustom, setUseCustom] = useState(false)
  const [error, setError] = useState('')

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<Venue[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  // If the user picks a known venue, we store its ID so we can skip upsert
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Prevents the venue useEffect re-triggering a search when we programmatically
  // set the venue name after the user selects a suggestion
  const suppressNextSearch = useRef(false)
  const didAutoFocus = useRef(false)
  const isMounted = useRef(false)

  const activeTip = useCustom ? parseFloat(customTip) : tip

  // Debounced venue search — empty query returns recent venues
  useEffect(() => {
    if (!isMounted.current) { isMounted.current = true; return }
    if (suppressNextSearch.current) { suppressNextSearch.current = false; return }
    setSelectedVenueId(null)
    const t = setTimeout(async () => {
      const results = await searchVenues(venue)
      setSuggestions(results)
      setShowSuggestions(results.length > 0)
    }, 250)
    return () => clearTimeout(t)
  }, [venue])

  function selectSuggestion(v: Venue) {
    suppressNextSearch.current = true  // skip the search triggered by setVenue below
    setVenue(v.name)
    setSelectedVenueId(v.id)
    setSuggestions([])
    setShowSuggestions(false)
    setError('')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!venue.trim()) { setError('Where are you?'); return }
    if (useCustom && (isNaN(activeTip) || activeTip < 0 || activeTip > 100)) {
      setError('Enter a valid tip percentage'); return
    }

    // Create tab in local state immediately — no loading spinner
    const tabId = createTab(venue, label, activeTip, 'pub')
    navigate(`/tab/${tabId}`)

    // Resolve the Supabase venue ID in the background.
    // If the user picked from suggestions we already have it; otherwise upsert.
    const venueId = selectedVenueId
    if (venueId) {
      setSupabaseVenueId(venueId)
    } else {
      upsertVenue(venue).then(v => { if (v) setSupabaseVenueId(v.id) })
    }
  }

  return (
    <div style={s.page}>
      <div style={s.header}>
        <h1 style={s.wordmark}>Divvy</h1>
        <p style={s.tagline}>Split the bill, not the friendship.</p>
      </div>

      <form onSubmit={handleSubmit} style={s.form}>

        {/* Venue with autocomplete */}
        <div style={s.field}>
          <label style={s.label}>Where are you?</label>
          <div style={{ position: 'relative' }}>
            <input
              ref={inputRef}
              style={s.input}
              type="text"
              placeholder="The Taproom, Café Caprice…"
              value={venue}
              autoFocus
              autoComplete="off"
              onChange={e => { setVenue(e.target.value); setError('') }}
              onFocus={async () => {
                if (!didAutoFocus.current) { didAutoFocus.current = true; return }
                const results = await searchVenues(venue)
                setSuggestions(results)
                setShowSuggestions(results.length > 0)
              }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            />
            {showSuggestions && (
              <ul style={s.dropdown}>
                {suggestions.map(v => (
                  <li
                    key={v.id}
                    style={s.dropdownItem}
                    onMouseDown={() => selectSuggestion(v)}
                  >
                    {v.name}
                  </li>
                ))}
                {venue.trim() && !suggestions.some(v => v.name.toLowerCase() === venue.trim().toLowerCase()) && (
                  <li
                    style={{ ...s.dropdownItem, ...s.dropdownAdd }}
                    onMouseDown={() => {
                      suppressNextSearch.current = true
                      setShowSuggestions(false)
                      setSuggestions([])
                      setError('')
                    }}
                  >
                    Add "{venue.trim()}"
                  </li>
                )}
              </ul>
            )}
          </div>
        </div>

        {/* Tab label (optional) */}
        <div style={s.field}>
          <label style={s.label}>
            Give it a name <span style={s.optional}>optional</span>
          </label>
          <input
            style={s.input}
            type="text"
            placeholder="Friday night, Work lunch…"
            value={label}
            onChange={e => setLabel(e.target.value)}
          />
        </div>

        {/* Tip */}
        <div style={s.field}>
          <label style={s.label}>Recommended tip</label>
          <div style={s.tipRow}>
            {TIP_PRESETS.map(pct => (
              <button
                key={pct}
                type="button"
                style={{ ...s.tipBtn, ...((!useCustom && tip === pct) ? s.tipBtnActive : {}) }}
                onClick={() => { setTip(pct); setUseCustom(false) }}
              >
                {pct}%
              </button>
            ))}
            <button
              type="button"
              style={{ ...s.tipBtn, ...(useCustom ? s.tipBtnActive : {}) }}
              onClick={() => setUseCustom(true)}
            >
              Custom
            </button>
          </div>
          {useCustom && (
            <input
              style={{ ...s.input, marginTop: 8 }}
              type="number"
              placeholder="e.g. 13"
              min="0" max="100" step="0.5"
              value={customTip}
              onChange={e => setCustomTip(e.target.value)}
              autoFocus
            />
          )}
        </div>

        {error && <p style={s.error}>{error}</p>}

        <button type="submit" style={s.submit}>Start tab →</button>
      </form>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100dvh', display: 'flex', flexDirection: 'column',
    justifyContent: 'center', padding: '2rem 1.5rem',
    maxWidth: 420, margin: '0 auto',
    fontFamily: "'DM Sans', system-ui, -apple-system, sans-serif",
    color: '#F0E8DC',
  },
  header: { marginBottom: '2.5rem' },
  wordmark: {
    fontSize: '2.5rem', fontWeight: 800, margin: 0,
    letterSpacing: '-0.03em', color: '#F0E8DC',
  },
  tagline: { margin: '0.4rem 0 0', color: '#7A6A58', fontSize: '1rem' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  field: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontWeight: 600, fontSize: '0.95rem', color: '#F0E8DC' },
  optional: { fontWeight: 400, color: '#7A6A58', fontSize: '0.85rem' },
  input: {
    padding: '0.75rem 1rem', fontSize: '1rem',
    background: '#1A1410',
    border: '1px solid rgba(232,160,48,0.2)',
    color: '#F0E8DC',
    borderRadius: 10, outline: 'none', width: '100%', boxSizing: 'border-box',
    transition: 'border-color 0.15s',
  },
  dropdown: {
    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
    background: '#1E1812', border: '1px solid rgba(232,160,48,0.15)', borderRadius: 10,
    boxShadow: '0 4px 24px rgba(0,0,0,0.4)', listStyle: 'none',
    margin: 0, padding: '0.25rem 0', zIndex: 50,
    maxHeight: 220, overflowY: 'auto',
  },
  dropdownItem: {
    padding: '0.7rem 1rem', cursor: 'pointer', fontSize: '0.95rem',
    color: '#F0E8DC', transition: 'background 0.1s',
  },
  dropdownAdd: {
    color: '#7A6A58', borderTop: '1px solid rgba(232,160,48,0.08)', fontStyle: 'italic',
  },
  tipRow: { display: 'flex', gap: 8 },
  tipBtn: {
    flex: 1, padding: '0.6rem 0', fontSize: '0.95rem', fontWeight: 600,
    border: '1px solid rgba(232,160,48,0.18)', borderRadius: 10,
    background: '#1A1410', cursor: 'pointer', transition: 'all 0.15s', color: '#7A6A58',
  },
  tipBtnActive: {
    background: 'rgba(232,160,48,0.15)', color: '#E8A030',
    borderColor: 'rgba(232,160,48,0.45)',
  },
  error: { margin: 0, color: '#E8A030', fontSize: '0.9rem' },
  submit: {
    padding: '0.9rem', fontSize: '1.05rem', fontWeight: 800,
    background: '#E8A030', color: '#1A0E00', border: 'none',
    borderRadius: 12, cursor: 'pointer', marginTop: '0.5rem',
  },
}
