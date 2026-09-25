import { useState } from 'react'
import type { Screen } from '../App'

interface Props { nav: (s: Screen) => void }

const SAMPLE_TEXT = `Meeting Notes — Enterprise Data Platform Kickoff
Date: January 15, 2025 | Attendees: Robert Walsh (VP Eng), Jane Doe (PM), Sara Kim (Lead Architect), Mark Chen (Data Engineer)

OBJECTIVES
• Consolidate 7 legacy BI systems into a single unified platform
• Enable real-time dashboards for all business units by Q3 2025
• Reduce reporting cycle time from 3 days to 4 hours
• Support 500+ concurrent users at launch

REQUIREMENTS
• Ingestion layer supporting Salesforce, SAP, and 12 internal databases
• Sub-5-second query response for standard reports
• Role-based access control (RBAC) with audit logging
• GDPR and SOC 2 Type II compliance required

RISKS & CONCERNS
• Legacy SAP integration timeline is unclear — vendor dependency
• Only 2 data engineers available; team may be understaffed
• Budget approved at $375K; scope may exceed budget if infrastructure costs spike

OPEN ITEMS / UNKNOWNS
• Security review process not yet initiated
• Disaster recovery SLA not defined
• Training plan for 300 end-users not scoped`

export default function AIProjectIntake({ nav }: Props) {
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzed, setAnalyzed] = useState(false)

  function handleAnalyze() {
    setAnalyzing(true)
    setTimeout(() => { setAnalyzing(false); setAnalyzed(true) }, 1800)
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Project Intake']} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>AI Project Intake</div>
        <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
          Provide raw project notes, meeting transcripts, or documents. AI will extract structured project information.
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {/* Main input */}
        <div>
          <div style={cardStyle}>
            <div style={sectionLabel}>Brainstorm / Meeting Notes</div>
            <textarea
              defaultValue={SAMPLE_TEXT}
              style={{
                width: '100%',
                minHeight: 320,
                padding: '12px 14px',
                border: '1px solid #d4d4d4',
                borderRadius: 4,
                fontSize: 13,
                lineHeight: 1.65,
                fontFamily: 'inherit',
                resize: 'vertical',
                outline: 'none',
                color: '#1a1a1a',
              }}
              placeholder="Paste meeting notes, project description, brainstorming content, or any freeform project context here…"
            />
            <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>
              AI will identify objectives, requirements, deliverables, constraints, and risks automatically.
            </div>
          </div>

          {/* Upload options */}
          <div style={{ ...cardStyle, marginTop: 16 }}>
            <div style={sectionLabel}>Upload Documents</div>
            <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { icon: '📄', label: 'PDF', sub: 'Reports, specs' },
                { icon: '📝', label: 'Word / DOCX', sub: 'Project docs' },
                { icon: '💬', label: 'Transcript', sub: 'Meeting text' },
                { icon: '🎙', label: 'Audio', sub: 'MP3, WAV, M4A' },
              ].map(u => (
                <button key={u.label} style={{
                  padding: '14px 10px',
                  border: '1px dashed #c8c8c8',
                  borderRadius: 6,
                  background: '#fafafa',
                  cursor: 'pointer',
                  textAlign: 'center',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 4,
                }}>
                  <span style={{ fontSize: 22 }}>{u.icon}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{u.label}</span>
                  <span style={{ fontSize: 11, color: '#999' }}>{u.sub}</span>
                </button>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 11, color: '#999' }}>
              Drag files here or click a tile to browse. Max 50 MB per file.
            </div>
          </div>

          {/* Analyze button */}
          <div className="flex items-center justify-between" style={{ marginTop: 20 }}>
            <button onClick={() => nav('create-project')} style={secondaryBtn}>← Back</button>
            <div className="flex items-center gap-10">
              {analyzed && (
                <span style={{ fontSize: 13, color: '#3d7a3d', fontWeight: 500 }}>✓ Analysis complete — 6 sections extracted</span>
              )}
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                style={{
                  padding: '10px 28px',
                  background: analyzing ? '#888' : '#2d2d2d',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 4,
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: analyzing ? 'default' : 'pointer',
                }}
              >
                {analyzing ? 'Analyzing…' : analyzed ? 'Re-Analyze' : 'Analyze Project'}
              </button>
              {analyzed && (
                <button onClick={() => nav('scope-review')} style={{ ...primaryBtn, background: '#3d7a3d' }}>
                  Continue to Scope Review →
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right: tips + history */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cardStyle}>
            <div style={sectionLabel}>What AI Extracts</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { tag: 'OBJ', label: 'Objectives', color: '#e8f0e8' },
                { tag: 'REQ', label: 'Requirements', color: '#e8eaf0' },
                { tag: 'DEL', label: 'Deliverables', color: '#f0ece8' },
                { tag: 'CON', label: 'Constraints', color: '#f0e8e8' },
                { tag: 'RSK', label: 'Risks', color: '#fdf2e8' },
                { tag: 'UNK', label: 'Missing Info', color: '#f5f5f5' },
              ].map(e => (
                <div key={e.tag} className="flex items-center gap-8" style={{ fontSize: 12 }}>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 10, padding: '2px 6px', background: e.color, borderRadius: 3, color: '#555', width: 36, textAlign: 'center' }}>{e.tag}</span>
                  <span>{e.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div style={cardStyle}>
            <div style={sectionLabel}>Tips for Better Results</div>
            <ul style={{ fontSize: 12, color: '#555', lineHeight: 1.7, paddingLeft: 16, margin: 0 }}>
              <li>Include stakeholder names and roles</li>
              <li>Mention budget figures explicitly</li>
              <li>Note hard deadlines vs. targets</li>
              <li>List known dependencies</li>
              <li>Describe success criteria</li>
            </ul>
          </div>

          <div style={cardStyle}>
            <div style={sectionLabel}>Previous Intakes</div>
            {['ERP Migration (Jan 8)', 'Portal Redesign (Dec 22)', 'Warehouse Build (Dec 10)'].map(prev => (
              <div key={prev} style={{ fontSize: 12, color: '#555', padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                {prev}
              </div>
            ))}
          </div>
        </div>
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

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: '18px 20px' }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 600, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#2d2d2d', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#3a3a3a', border: '1px solid #d4d4d4', borderRadius: 4, fontSize: 13, cursor: 'pointer' }
