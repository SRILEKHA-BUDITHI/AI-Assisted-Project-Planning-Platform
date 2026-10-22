import { useMemo, useState } from 'react'
import { useParams } from 'react-router'
import { isApiError } from '@/lib/api'
import { useScopeItems, useUpdateScopeItem } from '@/lib/queries'
import { useStepNav } from '@/lib/steps'
import { SCOPE_CATEGORIES, SCOPE_CATEGORY_LABELS, type ScopeCategory, type ScopeItem } from '@/lib/types'

const SECTION_COLOR: Record<ScopeCategory, string> = {
  objective: '#DDE7D0',
  requirement: '#E3DCCB',
  deliverable: '#F5E3C8',
  constraint: '#F3D9D5',
  risk: '#F5E3C8',
  missing_info: '#F3EADB',
}

export default function ScopeReview() {
  const nav = useStepNav()
  const { projectId = '' } = useParams()
  const itemsQuery = useScopeItems(projectId)
  const updateItem = useUpdateScopeItem(projectId)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const items = itemsQuery.data ?? []
  const sections = useMemo(() => {
    const grouped = Object.fromEntries(SCOPE_CATEGORIES.map((c) => [c, [] as ScopeItem[]])) as Record<ScopeCategory, ScopeItem[]>
    for (const item of items) grouped[item.category].push(item)
    return grouped
  }, [items])

  function accept(id: string) {
    updateItem.mutate({ itemId: id, patch: { status: 'accepted' } })
  }
  function remove(id: string) {
    updateItem.mutate({ itemId: id, patch: { status: 'removed' } })
  }
  function startEdit(id: string, text: string) {
    setEditing(id)
    setEditText(text)
  }
  function saveEdit(id: string) {
    updateItem.mutate({ itemId: id, patch: { text: editText } })
    setEditing(null)
  }
  function acceptAll() {
    for (const item of items) {
      if (item.status === 'pending') updateItem.mutate({ itemId: item.id, patch: { status: 'accepted' } })
    }
  }

  const visibleItems = items.filter((i) => i.status !== 'removed')
  const totalAccepted = visibleItems.filter((i) => i.status === 'accepted').length
  const total = visibleItems.length

  if (itemsQuery.isPending) {
    return (
      <div style={{ padding: '32px 36px', maxWidth: 900 }}>
        <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review']} />
        <div style={{ fontSize: 13, color: '#7A6063' }}>Loading scope items…</div>
      </div>
    )
  }

  if (itemsQuery.isError) {
    return (
      <div style={{ padding: '32px 36px', maxWidth: 900 }}>
        <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review']} />
        <div style={{ fontSize: 13, color: '#A83A4A' }}>
          {isApiError(itemsQuery.error) ? itemsQuery.error.message : 'Something went wrong loading scope items.'}
        </div>
      </div>
    )
  }

  if (total === 0) {
    return (
      <div style={{ padding: '32px 36px', maxWidth: 900 }}>
        <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review']} />
        <div style={cardStyle}>
          <div style={{ fontSize: 14, marginBottom: 12 }}>No scope items yet.</div>
          <div style={{ fontSize: 13, color: '#7A6063', marginBottom: 16 }}>
            Go back to AI Intake and analyze your project notes to extract objectives, requirements, and risks.
          </div>
          <button onClick={() => nav('intake')} style={secondaryBtn}>← Back to AI Intake</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review']} />

      <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Scope Review</div>
          <div style={{ fontSize: 13, color: '#7A6063', marginTop: 2 }}>
            Review AI-extracted project information. Accept, edit, or remove each item.
          </div>
        </div>
        <div className="flex items-center gap-10">
          <span style={{ fontSize: 13, color: '#7A6063' }}>
            <strong style={{ color: '#2E1A1D' }}>{totalAccepted}</strong> / {total} accepted
          </span>
          <button onClick={acceptAll} style={secondaryBtn}>Accept All</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SCOPE_CATEGORIES.map((category) => {
          const visible = sections[category].filter((i) => i.status !== 'removed')
          if (visible.length === 0) return null
          const accepted = visible.filter((i) => i.status === 'accepted').length
          return (
            <div key={category} style={cardStyle}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div className="flex items-center gap-8">
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6B5254' }}>
                    {SCOPE_CATEGORY_LABELS[category]}
                  </span>
                  <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '2px 8px', background: SECTION_COLOR[category], borderRadius: 10, color: '#6B5254' }}>
                    {accepted}/{visible.length} accepted
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {visible.map(item => (
                  <div
                    key={item.id}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 10,
                      padding: '8px 10px',
                      background: item.status === 'accepted' ? '#F7F9F2' : '#FAF5EB',
                      border: `1px solid ${item.status === 'accepted' ? '#BFD1AE' : '#E8DCC6'}`,
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ fontSize: 14, marginTop: 1, color: item.status === 'accepted' ? '#4F7A4A' : '#ccc', flexShrink: 0 }}>
                      {item.status === 'accepted' ? '✓' : '○'}
                    </span>
                    <div style={{ flex: 1, fontSize: 13, lineHeight: 1.5 }}>
                      {editing === item.id ? (
                        <div className="flex gap-6">
                          <input
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            style={{ flex: 1, padding: '4px 8px', border: '1px solid #bbb', borderRadius: 3, fontSize: 13, fontFamily: 'inherit' }}
                            autoFocus
                          />
                          <button onClick={() => saveEdit(item.id)} style={{ fontSize: 12, padding: '4px 10px', background: '#722F37', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>Save</button>
                          <button onClick={() => setEditing(null)} style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #CDBFAB', borderRadius: 3, cursor: 'pointer', background: '#fff' }}>Cancel</button>
                        </div>
                      ) : (
                        item.text
                      )}
                    </div>
                    {editing !== item.id && (
                      <div className="flex gap-4" style={{ flexShrink: 0 }}>
                        {item.status !== 'accepted' && (
                          <button onClick={() => accept(item.id)} style={miniBtn('#4F7A4A', '#DDE7D0')}>Accept</button>
                        )}
                        <button onClick={() => startEdit(item.id, item.text)} style={miniBtn('#722F37', '#F3EADB')}>Edit</button>
                        <button onClick={() => remove(item.id)} style={miniBtn('#A83A4A', '#F3D9D5')}>Remove</button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
        <button onClick={() => nav('intake')} style={secondaryBtn}>← Back to AI Intake</button>
        <button onClick={() => nav('wbs')} style={primaryBtn}>Continue to WBS Builder →</button>
      </div>
    </div>
  )
}

function Breadcrumb({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#7A6063', marginBottom: 20 }}>
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          {i > 0 && <span>›</span>}
          <span style={{ color: i === steps.length - 1 ? '#2E1A1D' : '#7A6063' }}>{s}</span>
        </span>
      ))}
    </div>
  )
}

function miniBtn(color: string, bg: string): React.CSSProperties {
  return { fontSize: 11, padding: '3px 8px', background: bg, color, border: `1px solid ${color}22`, borderRadius: 3, cursor: 'pointer', fontWeight: 500 }
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #E8DCC6', borderRadius: 6, padding: '16px 18px' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#722F37', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#4A2B2F', border: '1px solid #CDBFAB', borderRadius: 4, fontSize: 13, cursor: 'pointer' }
