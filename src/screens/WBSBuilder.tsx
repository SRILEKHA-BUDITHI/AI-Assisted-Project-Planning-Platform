import { useState } from 'react'
import { useStepNav } from '@/lib/steps'

interface WBSItem {
  code: string
  level: 1 | 2 | 3
  name: string
  duration?: string
  owner?: string
  expanded?: boolean
}

const INITIAL_WBS: WBSItem[] = [
  { code: '1', level: 1, name: 'Enterprise Data Platform', expanded: true },
  { code: '1.1', level: 2, name: 'Data Ingestion Layer', expanded: true },
  { code: '1.1.1', level: 3, name: 'Salesforce connector development', duration: '3w', owner: 'M. Chen' },
  { code: '1.1.2', level: 3, name: 'SAP integration setup', duration: '4w', owner: 'M. Chen' },
  { code: '1.1.3', level: 3, name: 'Internal DB pipeline scripting (12 sources)', duration: '6w', owner: 'S. Kim' },
  { code: '1.1.4', level: 3, name: 'Data quality validation framework', duration: '2w', owner: 'S. Kim' },
  { code: '1.2', level: 2, name: 'Data Warehouse & ETL', expanded: true },
  { code: '1.2.1', level: 3, name: 'Schema design and data modeling', duration: '3w', owner: 'S. Kim' },
  { code: '1.2.2', level: 3, name: 'ETL pipeline development', duration: '5w', owner: 'M. Chen' },
  { code: '1.2.3', level: 3, name: 'Performance tuning and indexing', duration: '2w', owner: 'S. Kim' },
  { code: '1.3', level: 2, name: 'Dashboard & Reporting Portal', expanded: true },
  { code: '1.3.1', level: 3, name: 'BI tool configuration and setup', duration: '2w', owner: 'T. Rivera' },
  { code: '1.3.2', level: 3, name: 'Standard report library (40 reports)', duration: '4w', owner: 'T. Rivera' },
  { code: '1.3.3', level: 3, name: 'Self-service analytics layer', duration: '3w', owner: 'T. Rivera' },
  { code: '1.4', level: 2, name: 'Security & Compliance', expanded: true },
  { code: '1.4.1', level: 3, name: 'RBAC implementation', duration: '2w', owner: 'S. Kim' },
  { code: '1.4.2', level: 3, name: 'Audit logging system', duration: '1w', owner: 'M. Chen' },
  { code: '1.4.3', level: 3, name: 'SOC 2 / GDPR compliance review', duration: '3w', owner: 'External' },
  { code: '1.5', level: 2, name: 'Training & Rollout', expanded: false },
  { code: '1.5.1', level: 3, name: 'End-user training materials', duration: '2w', owner: 'J. Doe' },
  { code: '1.5.2', level: 3, name: 'Phased rollout (300 users)', duration: '3w', owner: 'J. Doe' },
]

const AI_ISSUES = [
  { type: 'missing', text: 'Disaster recovery / backup procedures not represented in WBS' },
  { type: 'missing', text: '1.4 Security section missing penetration testing work package' },
  { type: 'duplicate', text: '1.1.4 (data quality) may overlap with 1.2.3 (performance tuning) — verify scope boundary' },
  { type: 'warning', text: 'WBS code 1.3 has no testing or UAT work package before release' },
]

export default function WBSBuilder() {
  const nav = useStepNav()
  const [wbs, setWbs] = useState(INITIAL_WBS)

  function toggleExpand(code: string) {
    setWbs(prev => prev.map(i => i.code === code ? { ...i, expanded: !i.expanded } : i))
  }

  function isVisible(item: WBSItem): boolean {
    if (item.level === 1) return true
    if (item.level === 2) return true
    if (item.level === 3) {
      const parentCode = item.code.split('.').slice(0, 2).join('.')
      const parent = wbs.find(i => i.code === parentCode)
      return !!parent?.expanded
    }
    return true
  }

  const issueColor: Record<string, string> = { missing: '#fdf2e8', duplicate: '#fef5e8', warning: '#fef0f0' }
  const issueTag: Record<string, string> = { missing: '#c47a00', duplicate: '#c47a00', warning: '#b03030' }

  return (
    <div style={{ padding: '32px 36px' }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review', 'WBS Builder']} />

      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>WBS Builder</div>
          <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
            Review and refine the hierarchical Work Breakdown Structure. AI has pre-populated based on scope.
          </div>
        </div>
        <div className="flex gap-8">
          <button style={secondaryBtn}>+ Add Deliverable</button>
          <button style={secondaryBtn}>+ Add Work Package</button>
          <button style={{ ...secondaryBtn, fontFamily: 'DM Mono, monospace', fontSize: 11 }}>Export WBS</button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {/* WBS tree */}
        <div style={cardStyle}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #f0f0f0', display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 80px', gap: 10 }}>
            <span>WBS Code</span>
            <span>Name</span>
            <span>Duration</span>
            <span>Owner</span>
            <span>Actions</span>
          </div>
          {wbs.filter(isVisible).map(item => (
            <div
              key={item.code}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 80px 100px 80px',
                gap: 10,
                alignItems: 'center',
                padding: '7px 0',
                paddingLeft: item.level === 2 ? 16 : item.level === 3 ? 32 : 0,
                borderBottom: '1px solid #f5f5f5',
                borderLeft: item.level === 2 ? '2px solid #d4d4d4' : item.level === 3 ? '2px solid #e8e8e8' : 'none',
                marginLeft: item.level === 2 ? 16 : item.level === 3 ? 32 : 0,
                background: item.level === 1 ? '#fafafa' : 'transparent',
              }}
            >
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#737373' }}>{item.code}</span>
              <span
                style={{
                  fontSize: item.level === 1 ? 14 : item.level === 2 ? 13 : 13,
                  fontWeight: item.level === 1 ? 700 : item.level === 2 ? 600 : 400,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  cursor: item.level < 3 ? 'pointer' : 'default',
                }}
                onClick={() => item.level < 3 && toggleExpand(item.code)}
              >
                {item.level < 3 && (
                  <span style={{ fontSize: 10, color: '#999', userSelect: 'none' }}>
                    {item.expanded ? '▼' : '▶'}
                  </span>
                )}
                {item.name}
              </span>
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#737373' }}>{item.duration || '—'}</span>
              <span style={{ fontSize: 12, color: '#555' }}>{item.owner || '—'}</span>
              <div className="flex gap-4">
                <button style={{ fontSize: 11, color: '#555', border: '1px solid #e0e0e0', borderRadius: 3, padding: '2px 7px', background: '#fafafa', cursor: 'pointer' }}>Edit</button>
                {item.level < 3 && (
                  <button style={{ fontSize: 11, color: '#555', border: '1px solid #e0e0e0', borderRadius: 3, padding: '2px 7px', background: '#fafafa', cursor: 'pointer' }}>+ Sub</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* AI Validation panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>AI Validation</div>
            <div style={{ fontSize: 12, color: '#3d7a3d', fontWeight: 500, marginBottom: 10 }}>✓ WBS structure is valid (3 levels)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AI_ISSUES.map((issue, i) => (
                <div key={i} style={{ padding: '8px 10px', background: issueColor[issue.type] || '#f5f5f5', borderRadius: 4, borderLeft: `3px solid ${issueTag[issue.type]}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: issueTag[issue.type], textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                    {issue.type}
                  </div>
                  <div style={{ fontSize: 12, color: '#3a3a3a', lineHeight: 1.5 }}>{issue.text}</div>
                </div>
              ))}
            </div>
            <button style={{ ...secondaryBtn, width: '100%', marginTop: 12, fontSize: 12 }}>Re-Validate WBS</button>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>WBS Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#555' }}>
              {[
                ['Level 1 (Project)', '1'],
                ['Level 2 (Deliverables)', '5'],
                ['Level 3 (Work Packages)', '14'],
                ['Total Work Packages', '14'],
                ['Unassigned Packages', '2'],
                ['Estimated Weeks', '38w total'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between" style={{ paddingBottom: 5, borderBottom: '1px solid #f0f0f0' }}>
                  <span>{k}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 500, color: '#1a1a1a' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between" style={{ marginTop: 24 }}>
        <button onClick={() => nav('scope')} style={secondaryBtn}>← Back to Scope Review</button>
        <button onClick={() => nav('constraints')} style={primaryBtn}>Continue to Constraints →</button>
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
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#2d2d2d', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#3a3a3a', border: '1px solid #d4d4d4', borderRadius: 4, fontSize: 13, cursor: 'pointer' }
