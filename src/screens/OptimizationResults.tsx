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

const SCENARIOS = [
  {
    id: 'recommended',
    name: 'Recommended Plan',
    status: 'Feasible',
    budget: '$361,200',
    budgetNote: '$13,800 under budget',
    completion: 'Oct 14, 2025',
    completionNote: '14 days over target',
    utilization: '77%',
    recommendation: 'Assign SAP Integration to a contract SAP specialist and move Performance Tuning to weeks 16–17.',
    note: 'All hard constraints are satisfied with one external SAP specialist.',
  },
  {
    id: 'internal-only',
    name: 'Internal Team Only',
    status: 'Infeasible',
    budget: '$344,800',
    budgetNote: '$30,200 under budget',
    completion: 'Nov 25, 2025',
    completionNote: '6 weeks later',
    utilization: '96%',
    recommendation: 'No valid reassignment resolves the SAP skill gap and Mark Chen’s overallocation.',
    note: 'Skill coverage and maximum-capacity constraints cannot both be satisfied.',
  },
  {
    id: 'accelerated',
    name: 'Accelerated Delivery',
    status: 'Feasible',
    budget: '$373,900',
    budgetNote: '$1,100 under budget',
    completion: 'Sep 30, 2025',
    completionNote: 'Meets target date',
    utilization: '84%',
    recommendation: 'Add the SAP specialist and assign Lisa Park to Internal DB Pipelines for parallel delivery.',
    note: 'Meets the target date with higher utilization and contractor spend.',
  },
] as const

export default function OptimizationResults() {
  const nav = useStepNav()
  const [activeTab, setActiveTab] = useState<'reassignments' | 'schedule' | 'resources'>('reassignments')
  const [applied, setApplied] = useState(false)
  const [scenarioId, setScenarioId] = useState<string>('recommended')
  const scenario = SCENARIOS.find(item => item.id === scenarioId) ?? SCENARIOS[0]
  const isFeasible = scenario.status === 'Feasible'

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review', 'WBS', 'Constraints', 'Optimization Results']} />

      <div className="flex items-start justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>Optimization Results</div>
          <div style={{ fontSize: 13, color: '#6b6987', marginTop: 2 }}>
            OR-Tools solver completed. Review recommended plan adjustments before finalizing.
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: isFeasible ? '#dcf3e8' : '#fde8ee', border: `1px solid ${isFeasible ? '#b9e3cf' : '#f1c6d2'}`, borderRadius: 6 }}>
          <span style={{ fontSize: 13, color: isFeasible ? '#3f8a6a' : '#c4506a', fontWeight: 600 }}>{scenario.status.toUpperCase()}</span>
          <span style={{ fontSize: 12, color: isFeasible ? '#5a9a5a' : '#a05a5a', fontFamily: 'DM Mono, monospace' }}>OR-Tools CP-SAT · 4.3s</span>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Solver Status', value: scenario.status, sub: isFeasible ? 'All hard constraints satisfied' : 'Hard constraints conflict', color: isFeasible ? '#3f8a6a' : '#c4506a' },
          { label: 'Budget', value: scenario.budget, sub: scenario.budgetNote, color: isFeasible ? '#3f8a6a' : '#4b4a9e' },
          { label: 'Completion Date', value: scenario.completion, sub: scenario.completionNote, color: scenario.id === 'accelerated' ? '#3f8a6a' : '#a8691f' },
          { label: 'Resource Utilization', value: scenario.utilization, sub: 'Average across 6 resources', color: scenario.id === 'internal-only' ? '#c4506a' : '#4b4a9e' },
          { label: 'Critical Path', value: '38 weeks', sub: 'SAP → ETL → BI chain', color: '#4b4a9e' },
        ].map(k => (
          <div key={k.label} style={cardStyle}>
            <div style={{ fontSize: 10, color: '#6b6987', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: k.color, marginBottom: 2 }}>{k.value}</div>
            <div style={{ fontSize: 11, color: '#6b6987' }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Feasibility notice */}
      <div style={{ padding: '12px 16px', background: isFeasible ? '#f6f5fd' : '#fde8ee', border: `1px solid ${isFeasible ? '#d9d6ee' : '#f1c6d2'}`, borderRadius: 6, marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: isFeasible ? '#6b6987' : '#c4506a', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>
          Recommended reassignment
        </div>
        <div style={{ fontSize: 13, color: '#38375a', marginBottom: 3 }}>{scenario.recommendation}</div>
        <div style={{ fontSize: 11, color: '#6b6987' }}>{scenario.note}</div>
      </div>

      {/* Alternative scenarios */}
      <div style={{ marginBottom: 20 }}>
        <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Alternative Scenarios</div>
          <div style={{ fontSize: 11, color: '#6b6987' }}>Select a scenario to compare solver outcomes</div>
        </div>
        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {SCENARIOS.map(item => {
            const selected = item.id === scenario.id
            const feasible = item.status === 'Feasible'
            return (
              <button
                key={item.id}
                onClick={() => {
                  setScenarioId(item.id)
                  setApplied(false)
                }}
                style={{
                  ...cardStyle,
                  padding: '14px 16px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  border: selected ? '2px solid #4b4a9e' : '1px solid #e4e2f7',
                  background: selected ? '#faf9fe' : '#fff',
                }}
              >
                <div className="flex items-center justify-between" style={{ marginBottom: 10 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#23223a' }}>{item.name}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: feasible ? '#3f8a6a' : '#c4506a', textTransform: 'uppercase' }}>{item.status}</span>
                </div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    ['Budget', item.budget],
                    ['Completion', item.completion.replace(', 2025', '')],
                    ['Utilization', item.utilization],
                  ].map(([label, value]) => (
                    <span key={label}>
                      <span style={{ display: 'block', fontSize: 9, color: '#6b6987', textTransform: 'uppercase', marginBottom: 2 }}>{label}</span>
                      <span style={{ display: 'block', fontSize: 11, color: '#4b4a9e', fontFamily: 'DM Mono, monospace' }}>{value}</span>
                    </span>
                  ))}
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div className="flex gap-0" style={{ borderBottom: '1px solid #e4e2f7', marginBottom: 20 }}>
          {(['reassignments', 'schedule', 'resources'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '10px 20px',
                border: 'none',
                borderBottom: activeTab === tab ? '2px solid #4b4a9e' : '2px solid transparent',
                background: 'transparent',
                fontSize: 13,
                fontWeight: activeTab === tab ? 600 : 400,
                color: activeTab === tab ? '#23223a' : '#6b6987',
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
              <tr style={{ borderBottom: '1px solid #e4e2f7' }}>
                {['Task', 'Current Assignment', 'Recommended', 'Reason'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 10, color: '#6b6987', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {REASSIGNMENTS.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f4f2fc' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{r.task}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#6b6987' }}>{r.current}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#4b4a9e', fontWeight: 500 }}>{r.recommended}</td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#5a5878' }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'schedule' && (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e2f7' }}>
                {['WBS', 'Task', 'Original', 'Optimized', 'Delta', 'Reason'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '6px 12px', fontSize: 10, color: '#6b6987', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {SCHEDULE_CHANGES.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #f4f2fc' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6b6987' }}>{r.wbs}</td>
                  <td style={{ padding: '10px 12px', fontWeight: 500 }}>{r.name}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6b6987' }}>{r.original}</td>
                  <td style={{ padding: '10px 12px', fontFamily: 'DM Mono, monospace', fontSize: 12 }}>{r.optimized}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, background: r.delta === '—' ? '#eeecf9' : '#fdeedd', color: r.delta === '—' ? '#6b6987' : '#a8691f', fontFamily: 'DM Mono, monospace', fontWeight: 600 }}>
                      {r.delta}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 12, color: '#5a5878' }}>{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {activeTab === 'resources' && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 80px', gap: 10, alignItems: 'center', marginBottom: 10, fontSize: 10, color: '#6b6987', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              <span>Resource</span>
              <span>Before Optimization</span>
              <span>After Optimization</span>
              <span>Change</span>
            </div>
            {RESOURCE_UTIL.map(r => {
              const delta = r.after - r.before
              return (
                <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '140px 1fr 1fr 80px', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f4f2fc' }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#e4e2f7', borderRadius: 4 }}>
                      <div style={{ width: `${r.before}%`, height: '100%', background: r.before >= 100 ? '#c4506a' : r.before > 80 ? '#a8691f' : '#aaa', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, width: 32, textAlign: 'right' }}>{r.before}%</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 8, background: '#e4e2f7', borderRadius: 4 }}>
                      <div style={{ width: `${r.after}%`, height: '100%', background: r.after >= 100 ? '#c4506a' : r.after > 80 ? '#a8691f' : '#4b4a9e', borderRadius: 4 }} />
                    </div>
                    <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, width: 32, textAlign: 'right' }}>{r.after}%</span>
                  </div>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: delta < 0 ? '#3f8a6a' : delta > 0 ? '#a8691f' : '#6b6987', fontWeight: 600 }}>
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
            <span style={{ fontSize: 13, color: '#3f8a6a', fontWeight: 500 }}>✓ Plan applied to project</span>
          )}
          <button style={secondaryBtn}>Export PDF Report</button>
          <button style={secondaryBtn}>Export to MS Project</button>
          <button
            onClick={() => setApplied(true)}
            disabled={!isFeasible}
            style={{ ...primaryBtn, background: applied ? '#3f8a6a' : isFeasible ? '#4b4a9e' : '#aaa', cursor: isFeasible ? 'pointer' : 'not-allowed' }}
          >
            {applied ? '✓ Plan Applied' : isFeasible ? 'Apply Optimized Plan' : 'Cannot Apply Infeasible Plan'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Breadcrumb({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#6b6987', marginBottom: 20, flexWrap: 'wrap' }}>
      {steps.map((s, i) => (
        <span key={s} className="flex items-center gap-2">
          {i > 0 && <span>›</span>}
          <span style={{ color: i === steps.length - 1 ? '#23223a' : '#6b6987' }}>{s}</span>
        </span>
      ))}
    </div>
  )
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e4e2f7', borderRadius: 6, padding: '18px 20px' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#4b4a9e', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#38375a', border: '1px solid #d9d6ee', borderRadius: 4, fontSize: 13, cursor: 'pointer' }
