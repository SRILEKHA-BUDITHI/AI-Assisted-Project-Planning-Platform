import { useState } from 'react'
import { useStepNav } from '@/lib/steps'

const REASSIGNMENTS = [
  { task: '1.1.2 SAP Integration', current: 'Mark Chen (100% util)', recommended: 'Contract: SAP Specialist', reason: 'Skill gap + overallocation' },
  { task: '1.4.3 SOC 2 Review', current: 'Unassigned', recommended: 'James Wu (16h/wk)', reason: 'Only qualified resource available' },
  { task: '1.2.3 Performance Tuning', current: 'Sara Kim (wk 14–15)', recommended: 'Sara Kim (wk 16–17)', reason: 'Dependency chain resolved; shift avoids conflict' },
  { task: '1.1.3 Internal DB Pipelines', current: 'Sara Kim (solo)', recommended: 'Sara Kim + Lisa Park', reason: 'Parallelization reduces duration by 2 weeks' },
]

const SCHEDULE_CHANGES = [
  { wbs: '1.1.2', name: 'SAP Integration', original: 'Wk 3–6', optimized: 'Wk 4–8', delta: '+1w', reason: 'Contractor onboarding buffer' },
  { wbs: '1.2.2', name: 'ETL Pipeline Dev', original: 'Wk 7–11', optimized: 'Wk 9–13', delta: '+2w', reason: 'SAP dependency cascade' },
  { wbs: '1.3.1', name: 'BI Tool Setup', original: 'Wk 12–13', optimized: 'Wk 14–15', delta: '+2w', reason: 'Precursor ETL shift' },
  { wbs: '1.4.3', name: 'SOC 2 Review', original: 'Wk 28–30', optimized: 'Wk 28–30', delta: '—', reason: 'No change needed' },
  { wbs: '1.5.2', name: 'Phased Rollout', original: 'Wk 34–36', optimized: 'Wk 35–38', delta: '+2w', reason: 'Training dependency' },
]

const RESOURCE_UTIL = [
  { name: 'Sara Kim', before: 90, after: 82 },
  { name: 'Mark Chen', before: 100, after: 74 },
  { name: 'Tom Rivera', before: 75, after: 75 },
  { name: 'Lisa Park', before: 60, after: 78 },
  { name: 'James Wu', before: 0, after: 55 },
  { name: 'SAP Contractor', before: 0, after: 100 },
]

export default function OptimizationResults() {
  const nav = useStepNav()
  const [activeTab, setActiveTab] = useState<'reassignments' | 'schedule' | 'resources'>('reassignments')
  const [applied, setApplied] = useState(false)

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review', 'WBS', 'Constraints', 'Optimization Results']} />

      <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Optimization Results</div>
          <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
            Gurobi solver completed. Review recommended plan adjustments before finalizing.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: '#e8f5e8', border: '1px solid #c8dfc8', borderRadius: 6 }}>
          <span style={{ fontSize: 13, color: '#3d7a3d', fontWeight: 600 }}>✓ Optimization Complete</span>
          <span style={{ fontSize: 12, color: '#5a9a5a', fontFamily: 'DM Mono, monospace' }}>Gurobi v11.0.1 · 4.3s</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Solver Status', value: 'Optimal', sub: 'Feasible solution found', color: '#3d7a3d' },
          { label: 'Expected Cost', value: '$361,200', sub: '↓ $13,800 under budget', color: '#3d7a3d' },
          { label: 'Completion Date', value: 'Oct 14, 2025', sub: '↑ 14 days over target', color: '#c47a00' },
          { label: 'Avg. Utilization', value: '77%', sub: 'Across 6 resources', color: '#2d2d2d' },
          { label: 'Critical Path', value: '38 weeks', sub: 'SAP → ETL → BI chain', color: '#2d2d2d' },
        ].map(k => (
          <div key={k.label} style={cardStyle}>
            <div style={{ fontSize: 10, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#737373' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Feasibility notice */}
      <div style={{ padding: '12px 16px', background: '#fdf2e8', border: '1px solid #f0d898', borderRadius: 6, fontSize: 13, color: '#8a5a00', marginBottom: 20 }}>
        <strong>Note:</strong> A fully feasible solution requires contracting one SAP specialist (est. $28K). Without this, the schedule extends by 6 weeks and the budget constraint becomes infeasible. This is reflected in the recommendations below.
      </div>

      {/* Tabs */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div className="flex gap-0" style={{ borderBottom: '1px solid #e8e8e8', marginBottom: 20 }}>
          {(['reassignments', 'schedule', 'resources'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #2d2d2d' : '2px solid transparent',
                background: 'transparent',
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? '#1a1a1a' : '#737373',
                cursor: 'pointer',
                marginBottom: -1,
              }}
            >
              {tab === 'reassignments' ? 'Task Reassignments' : tab === 'schedule' ? 'Schedule Changes' : 'Resource Utilization'}
            </button>
          ))}
        </div>

        {activeTab === 'reassignments' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                {['Task', 'Current Assignment', 'Recommended', 'Reason'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 10, color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REASSIGNMENTS.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{r.task}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#737373' }}>{r.current}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#2d2d2d', fontWeight: 500 }}>{r.recommended}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'schedule' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e8e8e8' }}>
                {['WBS', 'Task', 'Original', 'Optimized', 'Delta', 'Reason'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 10, color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_CHANGES.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f5f5f5' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#737373' }}>{r.wbs}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#737373' }}>{r.original}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{r.optimized}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: r.delta === '—' ? '#f0f0f0' : '#fdf2e8', color: r.delta === '—' ? '#737373' : '#c47a00', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
                      {r.delta}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#555' }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'resources' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 80px', gap: 10, alignItems: 'center', marginBottom: 10, fontSize: 10, color: '#737373', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Resource</span>
              <span>Before Optimization</span>
              <span>After Optimization</span>
              <span>Change</span>
            </div>
            {RESOURCE_UTIL.map(r => {
              const delta = r.after - r.before
              return (
                <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 80px', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f5f5f5' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#e8e8e8', borderRadius: 4 }}>
                      <div style={{ width: `${r.before}%`, height: '100%', background: r.before >= 100 ? '#b03030' : r.before > 80 ? '#c47a00' : '#aaa', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, width: 32, textAlign: 'right' }}>{r.before}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#e8e8e8', borderRadius: 4 }}>
                      <div style={{ width: `${r.after}%`, height: '100%', background: r.after >= 100 ? '#b03030' : r.after > 80 ? '#c47a00' : '#2d2d2d', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, width: 32, textAlign: 'right' }}>{r.after}%</span>
                  </div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: delta < 0 ? '#3d7a3d' : delta > 0 ? '#c47a00' : '#737373', fontWeight: 600 }}>
                    {delta > 0 ? `+${delta}%` : delta < 0 ? `${delta}%` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <button onClick={() => nav('constraints')} style={secondaryBtn}>← Adjust Constraints</button>
        <div className="flex items-center gap-10">
          {applied && (
            <span style={{ fontSize: 13, color: '#3d7a3d', fontWeight: 500 }}>✓ Plan applied to project</span>
          )}
          <button style={secondaryBtn}>Export PDF Report</button>
          <button style={secondaryBtn}>Export to MS Project</button>
          <button
            onClick={() => setApplied(true)}
            style={{ ...primaryBtn, background: applied ? '#3d7a3d' : '#2d2d2d' }}
          >
            {applied ? '✓ Plan Applied' : 'Apply Optimized Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Breadcrumb({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#737373', marginBottom: 20, flexWrap: 'wrap' }}>
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
