/**
 * SelfIdentifyModal.tsx
 *
 * Shown to a non-creator device after the tab state loads.
 * Prompts the user to identify themselves as an existing participant
 * or add themselves as new. Stores the choice in localStorage so
 * it persists across refreshes on the same device.
 *
 * The modal is skipped if:
 *   - The user is the tab creator (they don't need to identify)
 *   - selfParticipantId is already set (returning device)
 *   - The tab is still loading
 */

import { useState } from 'react'
import { useTab } from '../context/TabContext'
import type { Participant } from '../types/entities'

function avatarUrl(avatarId: number) {
  return `/avatars/avatar-${String(avatarId).padStart(2, '0')}.webp`
}

const AVATAR_COUNT = 20

export default function SelfIdentifyModal() {
  const {
    participants,
    isCreator,
    isLoadingRemote,
    selfParticipantId,
    setSelfParticipantId,
    addParticipant,
    setParticipantAvatar,
    tab,
  } = useTab()

  // Creators start on the add-new form — the table is empty when they arrive
  const [view, setView] = useState<'pick' | 'new'>(isCreator ? 'new' : 'pick')
  const [newName, setNewName] = useState('')
  const [pendingAvatarId, setPendingAvatarId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // Don't show if: already identified, still loading, or no tab
  if (!tab || isLoadingRemote || selfParticipantId) return null

  function handlePick(participant: Participant) {
    setSelfParticipantId(participant.id)
  }

  async function handleAddNew() {
    if (!newName.trim() || submitting) return
    setSubmitting(true)
    const participant = addParticipant(newName.trim())
    if (pendingAvatarId !== null) {
      setParticipantAvatar(participant.id, pendingAvatarId)
    }
    setSelfParticipantId(participant.id)
  }

  return (
    <div style={s.backdrop}>
      <div style={s.card}>

        {/* Header */}
        <div style={s.header}>
          <p style={s.venue}>{tab.name}</p>
          <h2 style={s.title}>{isCreator ? 'Add yourself' : 'Who are you?'}</h2>
          <p style={s.sub}>
            {isCreator
              ? 'Add yourself to the table so your orders are tracked.'
              : 'Identify yourself to track what you\'ve ordered.'
            }
          </p>
        </div>

        {view === 'pick' ? (
          <>
            {participants.length > 0 ? (
              <>
                {/* Existing participants */}
                <div style={s.participantList}>
                  {participants.map(p => (
                    <button key={p.id} style={s.participantBtn} onClick={() => handlePick(p)}>
                      <div style={s.participantAvatar}>
                        {p.avatar_id
                          ? <img src={avatarUrl(p.avatar_id)} alt="" width={40} height={40} style={{ borderRadius: '50%', display: 'block' }} />
                          : <div style={s.avatarFallback}>{p.name.charAt(0).toUpperCase()}</div>
                        }
                      </div>
                      <span style={s.participantName}>{p.name}</span>
                      <span style={s.participantArrow}>→</span>
                    </button>
                  ))}
                </div>
                <div style={s.divider}>
                  <span style={s.dividerText}>not on the list?</span>
                </div>
              </>
            ) : (
              <p style={s.emptyHint}>No one's been added yet — add yourself below.</p>
            )}

            {/* Add new option */}
            <button style={s.newBtn} onClick={() => setView('new')}>
              + I'm new here
            </button>
          </>
        ) : (
          /* New participant form */
          <div style={s.newForm}>
            <p style={s.newFormHint}>Pick an avatar and enter your name.</p>

            {/* Avatar grid */}
            <div style={s.avatarGrid}>
              {Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map(id => {
                const selected = pendingAvatarId === id
                return (
                  <button
                    key={id}
                    onClick={() => setPendingAvatarId(selected ? null : id)}
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
                      width={52} height={52}
                      style={{ borderRadius: '50%', display: 'block' }}
                    />
                  </button>
                )
              })}
            </div>

            <input
              style={s.nameInput}
              placeholder="Your name"
              value={newName}
              autoFocus
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddNew()}
            />

            <div style={s.newFormActions}>
              {!isCreator && (
                <button style={s.backBtn} onClick={() => setView('pick')}>← Back</button>
              )}
              <button
                style={{ ...s.joinBtn, opacity: newName.trim() ? 1 : 0.45 }}
                onClick={handleAddNew}
                disabled={!newName.trim() || submitting}
              >
                Join tab
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  backdrop: {
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    padding: '0 0 0 0',
  },
  card: {
    background: 'white',
    borderRadius: '20px 20px 0 0',
    width: '100%', maxWidth: 480,
    padding: '1.5rem 1.5rem 2rem',
    boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
    maxHeight: '92dvh',
    overflowY: 'auto',
    display: 'flex', flexDirection: 'column', gap: 0,
  },
  header: {
    marginBottom: '1.25rem',
  },
  venue: {
    margin: '0 0 2px', fontSize: '0.7rem', fontWeight: 600,
    textTransform: 'uppercase', letterSpacing: '0.07em', color: '#bbb',
  },
  title: {
    margin: '0 0 4px', fontSize: '1.4rem', fontWeight: 800,
    color: '#1a1a1a', fontFamily: 'system-ui, sans-serif',
  },
  sub: {
    margin: 0, fontSize: '0.88rem', color: '#888',
  },
  participantList: {
    display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16,
  },
  participantBtn: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px',
    border: '1.5px solid #e8e8e8', borderRadius: 14,
    background: 'white', cursor: 'pointer',
    transition: 'border-color 0.12s, background 0.12s',
    textAlign: 'left' as const,
  },
  participantAvatar: {
    flexShrink: 0, width: 40, height: 40,
  },
  avatarFallback: {
    width: 40, height: 40, borderRadius: '50%',
    background: '#e8e8e8', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
    fontSize: '1rem', fontWeight: 700, color: '#555',
  },
  participantName: {
    flex: 1, fontSize: '0.95rem', fontWeight: 600, color: '#1a1a1a',
  },
  participantArrow: {
    fontSize: '0.85rem', color: '#ccc', flexShrink: 0,
  },
  divider: {
    display: 'flex', alignItems: 'center', gap: 10,
    marginBottom: 12,
  },
  dividerText: {
    fontSize: '0.75rem', color: '#ccc',
    whiteSpace: 'nowrap' as const, margin: '0 auto',
  },
  emptyHint: {
    fontSize: '0.88rem', color: '#aaa', textAlign: 'center' as const,
    margin: '0 0 16px',
  },
  newBtn: {
    width: '100%', padding: '0.75rem',
    border: '1.5px dashed #ccc', borderRadius: 14,
    background: 'none', cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 600, color: '#555',
  },
  newForm: {
    display: 'flex', flexDirection: 'column', gap: 14,
  },
  newFormHint: {
    margin: 0, fontSize: '0.85rem', color: '#888',
  },
  avatarGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6,
  },
  nameInput: {
    width: '100%', padding: '0.65rem 0.9rem',
    border: '1.5px solid #d0d0d0', borderRadius: 10,
    fontSize: '1rem', outline: 'none',
    boxSizing: 'border-box' as const,
  },
  newFormActions: {
    display: 'flex', gap: 8,
  },
  backBtn: {
    flex: 0, padding: '0.65rem 1rem',
    background: 'none', border: '1.5px solid #e8e8e8',
    borderRadius: 10, cursor: 'pointer',
    fontSize: '0.88rem', color: '#888',
  },
  joinBtn: {
    flex: 1, padding: '0.65rem',
    background: '#1a1a1a', color: 'white',
    border: 'none', borderRadius: 10, cursor: 'pointer',
    fontSize: '0.9rem', fontWeight: 700,
  },
}
