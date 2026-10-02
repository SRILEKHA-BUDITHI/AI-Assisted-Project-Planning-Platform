import { useState } from 'react'
import { useStepNav } from '@/lib/steps'

type ConstraintType = 'hard' | 'soft'

interface Dep { from: string; to: string; type: string }
interface Employee { name: string; role: string; available: number; allocated: number; skills: string[] }

const EMPLOYEES: Employee[] = [
  { name: 'Sara Kim', role: 'Lead Architect', available: 40, allocated: 36, skills: ['Data Modeling', 'AWS', 'PostgreSQL'] },
  { name: 'Mark Chen', role: 'Data Engineer', available: 40, allocated: 40, skills: ['Python', 'Spark', 'Kafka'] },
  { name: 'Tom Rivera', role: 'BI Developer', available: 32, allocated: 24, skills: ['Tableau', 'Power BI', 'SQL'] },
  { name: 'Lisa Park', role: 'DevOps', available: 20, allocated: 12, skills: ['Kubernetes', 'Terraform', 'CI/CD'] },
  { name: 'James Wu', role: 'Security Eng.', available: 16, allocated: 0, skills: ['SOC 2', 'RBAC', 'Pen Testing'] },
]

const DEPS: Dep[] = [
  { from: '1.1.1 Salesforce Connector', to: '1.2.2 ETL Pipeline', type: 'Finish-to-Start' },
  { from: '1.1.2 SAP Integration', to: '1.2.2 ETL Pipeline', type: 'Finish-to-Start' },
  { from: '1.2.1 Schema Design', to: '1.2.2 ETL Pipeline', type: 'Finish-to-Start' },
  { from: '1.2.2 ETL Pipeline', to: '1.3.1 BI Tool Setup', type: 'Finish-to-Start' },
  { from: '1.4.1 RBAC', to: '1.3.3 Self-Service Analytics', type: 'Start-to-Start' },
]

export default function Constraints() {
  const nav = useStepNav()
  const [budgetType, setBudgetType] = useState<ConstraintType>('hard')
  const [deadlineType, setDeadlineType] = useState<ConstraintType>('hard')
  const [capacityType, setCapacityType] = useState<ConstraintType>('soft')
  const [skillType, setSkillType] = useState<ConstraintType>('hard')

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review', 'WBS Builder', 'Constraints']} />

      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Constraints</div>
        <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
          Define hard and soft constraints. These parameters drive Gurobi optimization.
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Budget */}
        <div style={cardStyle}>
          <SectionHeader label="Budget" badge={budgetType} onToggle={() => setBudgetType(t => t === 'hard' ? 'soft' : 'hard')} />
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Total Budget">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: 8, color: '#737373', fontSize: 13 }}>$</span>
                <input defaultValue="375,000" style={{ ...inputStyle, paddingLeft: 20 }} />
              </div>
            </Field>
            <Field label="Contingency Reserve">
              <div style={{ position: 'relative' }}>
                <input defaultValue="0" style={{ ...inputStyle, paddingRight: 28 }} />
                <span style={{ position: 'absolute', right: 10, top: 8, color: '#737373', fontSize: 13 }}>%</span>
              </div>
            </Field>
            <Field label="Labor Cost Cap">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: 8, color: '#737373', fontSize: 13 }}>$</span>
                <input defaultValue="280,000" style={{ ...inputStyle, paddingLeft: 20 }} />
              </div>
            </Field>
            <Field label="Infrastructure Cap">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: 8, color: '#737373', fontSize: 13 }}>$</span>
                <input defaultValue="95,000" style={{ ...inputStyle, paddingLeft: 20 }} />
              </div>
            </Field>
          </div>
          <div style={{ marginTop: 10, padding: '8px 10px', background: '#fdf2e8', borderRadius: 4, fontSize: 12, color: '#c47a00' }}>
            ⚠ No contingency buffer approved — optimization will flag budget risk.
          </div>
        </div>

        {/* Deadline */}
        <div style={cardStyle}>
          <SectionHeader label="Deadline" badge={deadlineType} onToggle={() => setDeadlineType(t => t === 'hard' ? 'soft' : 'hard')} />
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <Field label="Project Start Date">
              <input type="date" defaultValue="2025-01-15" style={inputStyle} />
            </Field>
            <Field label="Must-Finish-By Date">
              <input type="date" defaultValue="2025-09-30" style={inputStyle} />
            </Field>
            <Field label="Phase 1 Milestone (Ingestion)">
              <input type="date" defaultValue="2025-04-15" style={inputStyle} />
            </Field>
            <Field label="Phase 2 Milestone (Dashboard)">
              <input type="date" defaultValue="2025-07-31" style={inputStyle} />
            </Field>
          </div>
          <Field label="Working Days per Week">
            <select style={inputStyle}>
              <option>5 days (Mon–Fri)</option>
              <option>4 days</option>
              <option>6 days</option>
            </select>
          </Field>
        </div>

        {/* Employee Capacity */}
        <div style={cardStyle}>
          <SectionHeader label="Employee Capacity" badge={capacityType} onToggle={() => setCapacityType(t => t === 'hard' ? 'soft' : 'hard')} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                {['Name', 'Role', 'Avail. (hrs/wk)', 'Allocated', 'Utilization'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '5px 8px', fontSize: 10, color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {EMPLOYEES.map(e => {
                const util = Math.round((e.allocated / e.available) * 100)
                return (
                  <tr key={e.name} style={{ borderBottom: '1px solid #f5f5f5' }}>
                    <td style={{ padding: '8px 8px', fontWeight: 500 }}>{e.name}</td>
                    <td style={{ padding: '8px 8px', color: '#737373' }}>{e.role}</td>
                    <td style={{ padding: '8px 8px', fontFamily: 'DM Mono, monospace' }}>{e.available}h</td>
                    <td style={{ padding: '8px 8px', fontFamily: 'DM Mono, monospace' }}>{e.allocated}h</td>
                    <td style={{ padding: '8px 8px' }}>
                      <div className="flex items-center gap-6">
                        <div style={{ width: 56, height: 5, background: '#e8e8e8', borderRadius: 3 }}>
                          <div style={{ width: `${util}%`, height: '100%', background: util >= 100 ? '#b03030' : util > 80 ? '#c47a00' : '#2d2d2d', borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, color: util >= 100 ? '#b03030' : '#555', fontWeight: util >= 100 ? 600 : 400 }}>{util}%</span>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Skills */}
        <div style={cardStyle}>
          <SectionHeader label="Required Skills" badge={skillType} onToggle={() => setSkillType(t => t === 'hard' ? 'soft' : 'hard')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            {[
              { skill: 'Data Modeling', required: true, available: true },
              { skill: 'SAP Integration', required: true, available: false },
              { skill: 'Spark / Kafka', required: true, available: true },
              { skill: 'SOC 2 / GDPR Compliance', required: true, available: true },
              { skill: 'Power BI / Tableau', required: true, available: true },
              { skill: 'Kubernetes / DevOps', required: false, available: true },
            ].map(s => (
              <div key={s.skill} className="flex items-center justify-between" style={{ fontSize: 12 }}>
                <span>{s.skill}</span>
                <div className="flex items-center gap-8">
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.required ? '#f0e8e8' : '#f5f5f5', color: s.required ? '#b03030' : '#737373' }}>
                    {s.required ? 'Required' : 'Optional'}
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: s.available ? '#e8f0e8' : '#fef2f2', color: s.available ? '#3d7a3d' : '#b03030' }}>
                    {s.available ? '✓ Covered' : '✗ Gap'}
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '8px 10px', background: '#fef2f2', borderRadius: 4, fontSize: 12, color: '#b03030' }}>
            ⚠ SAP Integration skill gap detected. Consider contracting or training.
          </div>
        </div>

        {/* Dependencies */}
        <div style={{ ...cardStyle, gridColumn: 'span 2' }}>
          <SectionHeader label="Task Dependencies" badge="hard" onToggle={() => {}} />
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                {['Predecessor', 'Successor', 'Dependency Type', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 10px', fontSize: 10, color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DEPS.map((d, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{d.from}</td>
                  <td style={{ padding: '8px 10px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{d.to}</td>
                  <td style={{ padding: '8px 10px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', background: '#e8eaf0', borderRadius: 10, color: '#555' }}>{d.type}</span>
                  </td>
                  <td style={{ padding: '8px 10px' }}>
                    <button style={{ fontSize: 11, color: '#555', border: '1px solid #e0e0e0', borderRadius: 3, padding: '2px 8px', background: '#fafafa', cursor: 'pointer', marginRight: 6 }}>Edit</button>
                    <button style={{ fontSize: 11, color: '#b03030', border: '1px solid #f0d4d4', borderRadius: 3, padding: '2px 8px', background: '#fef5f5', cursor: 'pointer' }}>Remove</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button style={{ marginTop: 12, ...secondaryBtn, fontSize: 12 }}>+ Add Dependency</button>
        </div>
      </div>

      <div className="flex justify-between" style={{ marginTop: 24 }}>
        <button onClick={() => nav('wbs')} style={secondaryBtn}>← Back to WBS Builder</button>
        <button onClick={() => nav('optimization')} style={primaryBtn}>Run Gurobi Optimization →</button>
      </div>
    </div>
  )
}

function SectionHeader({ label, badge, onToggle }: { label: string; badge: string; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid #f0f0f0' }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <button
        onClick={onToggle}
        style={{
          fontSize: 11,
          padding: '3px 10px',
          background: badge === 'hard' ? '#f0e8e8' : '#e8eaf0',
          color: badge === 'hard' ? '#b03030' : '#4455aa',
          border: 'none',
          borderRadius: 10,
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        {badge === 'hard' ? 'Hard Constraint' : 'Soft Constraint'}
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, marginBottom: 5, color: '#555', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</label>
      {children}
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
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d4d4d4', borderRadius: 4, fontSize: 13, background: '#fff', color: '#1a1a1a', outline: 'none', fontFamily: 'inherit' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#2d2d2d', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#3a3a3a', border: '1px solid #d4d4d4', borderRadius: 4, fontSize: 13, cursor: 'pointer' }
