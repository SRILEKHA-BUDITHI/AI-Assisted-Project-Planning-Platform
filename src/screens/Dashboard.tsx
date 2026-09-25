import type { Screen } from '../App'

const PROJECTS = [
  { id: 'P-001', name: 'ERP System Migration', status: 'On Track', progress: 68, budget: '$240K', due: 'Mar 15, 2025', pm: 'Jane Doe', risk: false },
  { id: 'P-002', name: 'Customer Portal Redesign', status: 'At Risk', progress: 34, budget: '$85K', due: 'Feb 28, 2025', pm: 'Mark Chen', risk: true },
  { id: 'P-003', name: 'Data Warehouse Build-Out', status: 'Delayed', progress: 12, budget: '$310K', due: 'Apr 10, 2025', pm: 'Sara Kim', risk: true },
  { id: 'P-004', name: 'Mobile App v2.0', status: 'On Track', progress: 81, budget: '$120K', due: 'Jan 31, 2025', pm: 'Tom Rivera', risk: false },
  { id: 'P-005', name: 'Compliance Automation', status: 'On Track', progress: 55, budget: '$62K', due: 'May 1, 2025', pm: 'Jane Doe', risk: false },
]

const NOTIFICATIONS = [
  { type: 'warn', text: 'P-002: Resource conflict detected — 3 tasks unassigned' },
  { type: 'alert', text: 'P-003: Deadline at risk — 14 days behind schedule' },
  { type: 'info', text: 'P-001: AI optimization complete — review recommended' },
  { type: 'info', text: 'P-004: Milestone "Beta Release" due in 5 days' },
]

const STATUS_COLOR: Record<string, string> = {
  'On Track': '#3d7a3d',
  'At Risk': '#c47a00',
  'Delayed': '#b03030',
}

interface Props { nav: (s: Screen) => void }

export default function Dashboard({ nav }: Props) {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Dashboard</div>
          <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>Welcome back, Jane — 5 active projects</div>
        </div>
        <button
          onClick={() => nav('create-project')}
          style={{ padding: '9px 20px', background: '#2d2d2d', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Create Project
        </button>
      </div>

      {/* KPI row */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { label: 'Total Projects', value: '5', sub: '2 created this month' },
          { label: 'On Track', value: '3', sub: '60% of portfolio' },
          { label: 'At Risk / Delayed', value: '2', sub: 'Needs attention' },
          { label: 'Total Budget', value: '$817K', sub: 'Across all projects' },
        ].map(k => (
          <div key={k.label} style={cardStyle}>
            <div style={{ fontSize: 11, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>{k.label}</div>
            <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: '#999' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 300px', gap: 20 }}>
        {/* Projects table */}
        <div style={cardStyle}>
          <div className="flex items-center justify-between" style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>My Projects</div>
            <input placeholder="Filter projects…" style={{ ...inputSm, width: 180 }} />
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                {['ID', 'Project Name', 'Status', 'Progress', 'Budget', 'Due Date', 'PM'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 11, color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PROJECTS.map((p, i) => (
                <tr
                  key={p.id}
                  style={{ borderBottom: i < PROJECTS.length - 1 ? '1px solid #f0f0f0' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#fafafa'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  onClick={() => nav('ai-intake')}
                >
                  <td style={{ padding: '10px 10px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#737373' }}>{p.id}</td>
                  <td style={{ padding: '10px 10px', fontWeight: 500 }}>{p.name}{p.risk && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', background: '#fef2f2', color: '#b03030', borderRadius: 10 }}>Risk</span>}</td>
                  <td style={{ padding: '10px 10px' }}>
                    <span style={{ fontSize: 12, color: STATUS_COLOR[p.status] || '#555', fontWeight: 500 }}>{p.status}</span>
                  </td>
                  <td style={{ padding: '10px 10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 60, height: 5, background: '#e8e8e8', borderRadius: 3 }}>
                        <div style={{ width: `${p.progress}%`, height: '100%', background: '#2d2d2d', borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, color: '#555' }}>{p.progress}%</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 10px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{p.budget}</td>
                  <td style={{ padding: '10px 10px', fontSize: 12, color: '#555' }}>{p.due}</td>
                  <td style={{ padding: '10px 10px', fontSize: 12, color: '#555' }}>{p.pm}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Notifications */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Notifications</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {NOTIFICATIONS.map((n, i) => (
                <div key={i} className="flex items-start gap-3" style={{ fontSize: 12, color: '#3a3a3a', padding: '8px 0', borderBottom: i < NOTIFICATIONS.length - 1 ? '1px solid #f0f0f0' : 'none' }}>
                  <span style={{ fontSize: 14, marginTop: 1, flexShrink: 0 }}>
                    {n.type === 'warn' ? '⚠' : n.type === 'alert' ? '🔴' : 'ℹ'}
                  </span>
                  <span>{n.text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* At-risk projects */}
          <div style={cardStyle}>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>At-Risk Projects</div>
            {PROJECTS.filter(p => p.risk).map(p => (
              <div key={p.id} style={{ marginBottom: 12, padding: '10px 12px', background: '#fafafa', border: '1px solid #e8e8e8', borderRadius: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: STATUS_COLOR[p.status], marginBottom: 4 }}>{p.status}</div>
                <div style={{ fontSize: 11, color: '#999' }}>Due {p.due} · {p.pm}</div>
                <button
                  onClick={() => nav('optimization-results')}
                  style={{ marginTop: 8, fontSize: 11, padding: '4px 10px', border: '1px solid #d4d4d4', borderRadius: 3, background: '#fff', cursor: 'pointer' }}
                >
                  View Optimization →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const cardStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e8e8e8',
  borderRadius: 6,
  padding: '20px 20px',
}

const inputSm: React.CSSProperties = {
  padding: '6px 10px',
  border: '1px solid #d4d4d4',
  borderRadius: 4,
  fontSize: 12,
  outline: 'none',
}
