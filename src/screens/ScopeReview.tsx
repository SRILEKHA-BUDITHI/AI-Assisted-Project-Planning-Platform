import { useState } from 'react'
import type { Screen } from '../App'

interface Item { id: string; text: string; accepted: boolean; removed: boolean }

const INITIAL: Record<string, Item[]> = {
  Objectives: [
    { id: 'o1', text: 'Consolidate 7 legacy BI systems into a unified data platform', accepted: true, removed: false },
    { id: 'o2', text: 'Enable real-time dashboards for all business units by Q3 2025', accepted: true, removed: false },
    { id: 'o3', text: 'Reduce reporting cycle time from 3 days to 4 hours', accepted: false, removed: false },
  ],
  Requirements: [
    { id: 'r1', text: 'Ingestion layer supporting Salesforce, SAP, and 12 internal databases', accepted: true, removed: false },
    { id: 'r2', text: 'Sub-5-second query response for standard reports', accepted: false, removed: false },
    { id: 'r3', text: 'Role-based access control (RBAC) with full audit logging', accepted: false, removed: false },
    { id: 'r4', text: 'GDPR and SOC 2 Type II compliance required', accepted: false, removed: false },
  ],
  Deliverables: [
    { id: 'd1', text: 'Data ingestion pipeline (Phase 1: Salesforce, SAP)', accepted: false, removed: false },
    { id: 'd2', text: 'Unified data warehouse schema and ETL processes', accepted: false, removed: false },
    { id: 'd3', text: 'Self-service dashboard portal for 500+ users', accepted: false, removed: false },
    { id: 'd4', text: 'Security and compliance documentation package', accepted: false, removed: false },
  ],
  Constraints: [
    { id: 'c1', text: 'Budget fixed at $375,000 — no contingency buffer approved', accepted: false, removed: false },
    { id: 'c2', text: 'Target go-live: Q3 2025 (September 30)', accepted: false, removed: false },
    { id: 'c3', text: 'Only 2 data engineers available for first 3 months', accepted: false, removed: false },
  ],
  Risks: [
    { id: 'rk1', text: 'SAP integration timeline uncertain — vendor dependency may delay Phase 1', accepted: false, removed: false },
    { id: 'rk2', text: 'Infrastructure costs may exceed budget if cloud spend spikes', accepted: false, removed: false },
    { id: 'rk3', text: 'End-user adoption risk — 300 users need training with no plan yet', accepted: false, removed: false },
  ],
  'Missing Information': [
    { id: 'm1', text: 'Security review process and timeline not initiated', accepted: false, removed: false },
    { id: 'm2', text: 'Disaster recovery SLA not defined', accepted: false, removed: false },
    { id: 'm3', text: 'User training and change management plan not scoped', accepted: false, removed: false },
  ],
}

const SECTION_COLOR: Record<string, string> = {
  Objectives: '#e8f0e8',
  Requirements: '#e8eaf0',
  Deliverables: '#f0ece8',
  Constraints: '#f0e8e8',
  Risks: '#fdf2e8',
  'Missing Information': '#f5f5f5',
}

interface Props { nav: (s: Screen) => void }

export default function ScopeReview({ nav }: Props) {
  const [sections, setSections] = useState(INITIAL)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  function accept(section: string, id: string) {
    setSections(prev => ({
      ...prev,
      [section]: prev[section].map(i => i.id === id ? { ...i, accepted: true } : i)
    }))
  }
  function remove(section: string, id: string) {
    setSections(prev => ({
      ...prev,
      [section]: prev[section].map(i => i.id === id ? { ...i, removed: true } : i)
    }))
  }
  function startEdit(id: string, text: string) { setEditing(id); setEditText(text) }
  function saveEdit(section: string, id: string) {
    setSections(prev => ({
      ...prev,
      [section]: prev[section].map(i => i.id === id ? { ...i, text: editText } : i)
    }))
    setEditing(null)
  }

  const acceptAll = () => {
    const updated: Record<string, Item[]> = {}
    Object.entries(sections).forEach(([k, v]) => {
      updated[k] = v.map(i => ({ ...i, accepted: i.removed ? i.accepted : true }))
    })
    setSections(updated)
  }

  const totalAccepted = Object.values(sections).flat().filter(i => i.accepted && !i.removed).length
  const total = Object.values(sections).flat().filter(i => !i.removed).length

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review']} />

      <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Scope Review</div>
          <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
            Review AI-extracted project information. Accept, edit, or remove each item.
          </div>
        </div>
        <div className="flex items-center gap-10">
          <span style={{ fontSize: 13, color: '#737373' }}>
            <strong style={{ color: '#1a1a1a' }}>{totalAccepted}</strong> / {total} accepted
          </span>
          <button onClick={acceptAll} style={secondaryBtn}>Accept All</button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Object.entries(sections).map(([section, items]) => {
          const visible = items.filter(i => !i.removed)
          const accepted = visible.filter(i => i.accepted).length
          return (
            <div key={section} style={cardStyle}>
              <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
                <div className="flex items-center gap-8">
                  <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#555' }}>{section}</span>
                  <span style={{ fontSize: 10, fontFamily: 'DM Mono, monospace', padding: '2px 8px', background: SECTION_COLOR[section] || '#f5f5f5', borderRadius: 10, color: '#555' }}>
                    {accepted}/{visible.length} accepted
                  </span>
                </div>
                <button style={{ fontSize: 11, color: '#737373', background: 'none', border: 'none', cursor: 'pointer' }}>+ Add item</button>
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
                      background: item.accepted ? '#f9fdf9' : '#fafafa',
                      border: `1px solid ${item.accepted ? '#c8dfc8' : '#e8e8e8'}`,
                      borderRadius: 4,
                    }}
                  >
                    <span style={{ fontSize: 14, marginTop: 1, color: item.accepted ? '#3d7a3d' : '#ccc', flexShrink: 0 }}>
                      {item.accepted ? '✓' : '○'}
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
                          <button onClick={() => saveEdit(section, item.id)} style={{ fontSize: 12, padding: '4px 10px', background: '#2d2d2d', color: '#fff', border: 'none', borderRadius: 3, cursor: 'pointer' }}>Save</button>
                          <button onClick={() => setEditing(null)} style={{ fontSize: 12, padding: '4px 8px', border: '1px solid #d4d4d4', borderRadius: 3, cursor: 'pointer', background: '#fff' }}>Cancel</button>
                        </div>
                      ) : (
                        item.text
                      )}
                    </div>
                    {editing !== item.id && (
                      <div className="flex gap-4" style={{ flexShrink: 0 }}>
                        {!item.accepted && (
                          <button onClick={() => accept(section, item.id)} style={miniBtn('#3d7a3d', '#e8f5e8')}>Accept</button>
                        )}
                        <button onClick={() => startEdit(item.id, item.text)} style={miniBtn('#2d2d2d', '#f5f5f5')}>Edit</button>
                        <button onClick={() => remove(section, item.id)} style={miniBtn('#b03030', '#fef5f5')}>Remove</button>
                      </div>
                    )}
                  </div>
                ))}
                {visible.length === 0 && (
                  <div style={{ fontSize: 12, color: '#999', padding: '8px 10px', fontStyle: 'italic' }}>All items removed</div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
        <button onClick={() => nav('ai-intake')} style={secondaryBtn}>← Back to AI Intake</button>
        <button onClick={() => nav('wbs-builder')} style={primaryBtn}>Continue to WBS Builder →</button>
      </div>
    </div>
  )
}

function Breadcrumb({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#737373', marginBottom: 20 }}>
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          {i > 0 && <span>›</span>}
          <span style={{ color: i === steps.length - 1 ? '#1a1a1a' : '#737373' }}>{s}</span>
        </span>
      ))}
    </div>
  )
}

function miniBtn(color: string, bg: string): React.CSSProperties {
  return { fontSize: 11, padding: '3px 8px', background: bg, color, border: `1px solid ${color}22`, borderRadius: 3, cursor: 'pointer', fontWeight: 500 }
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: '16px 18px' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#2d2d2d', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#3a3a3a', border: '1px solid #d4d4d4', borderRadius: 4, fontSize: 13, cursor: 'pointer' }
