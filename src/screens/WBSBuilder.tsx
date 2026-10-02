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
  { code: '1.0', level: 1, name: 'Enterprise Data Platform', expanded: true },
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
  const [selectedCode, setSelectedCode] = useState('1.1')
  const [draggedCode, setDraggedCode] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [validating, setValidating] = useState(false)
  const [lastValidated, setLastValidated] = useState('Validated just now')
  const [view, setView] = useState<'chart' | 'list'>('chart')

  function toggleExpand(code: string) {
    setWbs(prev => prev.map(i => i.code === code ? { ...i, expanded: !i.expanded } : i))
  }

  function isVisible(item: WBSItem): boolean {
    if (item.level === 1) return true
    const project = wbs.find(i => i.level === 1)
    if (item.level === 2) return !!project?.expanded
    if (item.level === 3) {
      const parentCode = item.code.split('.').slice(0, 2).join('.')
      const parent = wbs.find(i => i.code === parentCode)
      return !!project?.expanded && !!parent?.expanded
    }
    return true
  }

  function addDeliverable() {
    setWbs(prev => {
      const deliverableCount = prev.filter(item => item.level === 2).length
      return [
        ...prev,
        {
          code: `1.${deliverableCount + 1}`,
          level: 2,
          name: 'New deliverable',
          expanded: true,
        },
      ]
    })
  }

  function addWorkPackage() {
    setWbs(prev => {
      const selected = prev.find(item => item.code === selectedCode)
      const parentCode = selected?.level === 2
        ? selected.code
        : selected?.level === 3
          ? selected.code.split('.').slice(0, 2).join('.')
          : prev.find(item => item.level === 2)?.code

      if (!parentCode) return prev

      const childCount = prev.filter(item => item.level === 3 && item.code.startsWith(`${parentCode}.`)).length
      const next = [...prev]
      const lastChildIndex = next.reduce(
        (found, item, index) => item.code.startsWith(`${parentCode}.`) ? index : found,
        -1,
      )
      const parentIndex = next.findIndex(item => item.code === parentCode)
      next.splice(lastChildIndex >= 0 ? lastChildIndex + 1 : parentIndex + 1, 0, {
        code: `${parentCode}.${childCount + 1}`,
        level: 3,
        name: 'New work package',
        duration: '—',
        owner: 'Unassigned',
      })
      return next.map(item => item.code === parentCode ? { ...item, expanded: true } : item)
    })
  }

  function validateWbs() {
    setValidating(true)
    window.setTimeout(() => {
      setValidating(false)
      setLastValidated('Validated just now')
    }, 650)
  }

  function normalizeCodes(items: WBSItem[]) {
    let deliverable = 0
    let workPackage = 0
    return items.map(item => {
      if (item.level === 1) return { ...item, code: '1.0' }
      if (item.level === 2) {
        deliverable += 1
        workPackage = 0
        return { ...item, code: `1.${deliverable}` }
      }
      workPackage += 1
      return { ...item, code: `1.${deliverable}.${workPackage}` }
    })
  }

  function moveItem(sourceCode: string, targetCode: string) {
    if (sourceCode === targetCode) return
    setWbs(prev => {
      const source = prev.find(item => item.code === sourceCode)
      const target = prev.find(item => item.code === targetCode)
      if (!source || !target || source.level !== target.level || source.level === 1) return prev

      const sourceParent = source.code.split('.').slice(0, -1).join('.')
      const targetParent = target.code.split('.').slice(0, -1).join('.')
      if (sourceParent !== targetParent) return prev

      const sourceBlock = prev.filter(item => item.code === sourceCode || item.code.startsWith(`${sourceCode}.`))
      const remaining = prev.filter(item => !sourceBlock.includes(item))
      const targetIndex = remaining.findIndex(item => item.code === targetCode)
      const reordered = [...remaining]
      reordered.splice(targetIndex, 0, ...sourceBlock)
      return normalizeCodes(reordered)
    })
  }

  /** Keyboard alternative to dragging: Alt+Arrow moves an item within its parent. */
  function onRowKeyDown(event: React.KeyboardEvent, item: WBSItem) {
    if (!event.altKey || item.level === 1 || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
    event.preventDefault()
    const parent = item.code.split('.').slice(0, -1).join('.')
    const siblings = wbs.filter(i => i.level === item.level && i.code.split('.').slice(0, -1).join('.') === parent)
    const index = siblings.findIndex(i => i.code === item.code)
    if (event.key === 'ArrowUp' && index > 0) moveItem(item.code, siblings[index - 1].code)
    if (event.key === 'ArrowDown' && index < siblings.length - 1) moveItem(siblings[index + 1].code, item.code)
  }

  const issueColor: Record<string, string> = { missing: '#fdeedd', duplicate: '#fdeedd', warning: '#fde8ee' }
  const issueTag: Record<string, string> = { missing: '#a8691f', duplicate: '#a8691f', warning: '#c4506a' }

  return (
    <div style={{ padding: '32px 36px' }}>
      <Breadcrumb steps={['Dashboard', 'Create Project', 'AI Intake', 'Scope Review', 'WBS Builder']} />

      <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>WBS Builder</div>
          <div style={{ fontSize: 13, color: '#6b6987', marginTop: 2 }}>
            Review and refine the hierarchical Work Breakdown Structure. AI has pre-populated based on scope.
          </div>
        </div>
        <div className="flex gap-8">
          <div className="flex" style={{ border: '1px solid #d9d6ee', borderRadius: 4, overflow: 'hidden', marginRight: 8 }}>
            {(['chart', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ padding: '9px 14px', fontSize: 13, border: 'none', cursor: 'pointer', background: view === v ? '#e4e2f7' : '#fff', color: view === v ? '#4b4a9e' : '#38375a', fontWeight: view === v ? 600 : 400 }}>
                {v === 'chart' ? 'Org Chart' : 'List'}
              </button>
            ))}
          </div>
          <button onClick={addDeliverable} style={secondaryBtn}>+ Add Deliverable</button>
          <button onClick={addWorkPackage} style={secondaryBtn}>+ Add Work Package</button>
          <button onClick={validateWbs} disabled={validating} style={primaryBtn}>
            {validating ? 'Validating…' : 'AI Validate'}
          </button>
        </div>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 280px', gap: 20 }}>
        {view === 'chart' && (
          <div style={{ ...cardStyle, overflow: 'auto', minWidth: 0 }}>
            <OrgChart wbs={wbs} selectedCode={selectedCode} onSelect={setSelectedCode} onToggle={toggleExpand} />
          </div>
        )}
        {/* WBS tree */}
        <div style={{ ...cardStyle, display: view === 'list' ? 'block' : 'none' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: '#6b6987', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 14, paddingBottom: 8, borderBottom: '1px solid #eeecf9', display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 80px', gap: 10 }}>
            <span>WBS Code</span>
            <span>Name</span>
            <span>Duration</span>
            <span>Owner</span>
            <span>Actions</span>
          </div>
          {wbs.filter(isVisible).map(item => (
            <div
              key={item.code}
              draggable={item.level > 1}
              onDragStart={(event) => {
                setDraggedCode(item.code)
                event.dataTransfer.effectAllowed = 'move'
              }}
              onDragEnd={() => {
                setDraggedCode(null)
                setDropTarget(null)
              }}
              onDragOver={(event) => {
                if (!draggedCode || draggedCode === item.code) return
                event.preventDefault()
                setDropTarget(item.code)
              }}
              onDrop={(event) => {
                event.preventDefault()
                if (draggedCode) moveItem(draggedCode, item.code)
                setDraggedCode(null)
                setDropTarget(null)
              }}
              onClick={() => setSelectedCode(item.code)}
              onKeyDown={(event) => onRowKeyDown(event, item)}
              tabIndex={item.level > 1 ? 0 : undefined}
              aria-keyshortcuts={item.level > 1 ? 'Alt+ArrowUp Alt+ArrowDown' : undefined}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 1fr 80px 100px 80px',
                gap: 10,
                alignItems: 'center',
                padding: '7px 0',
                paddingLeft: item.level === 2 ? 16 : item.level === 3 ? 32 : 0,
                borderBottom: '1px solid #f4f2fc',
                borderLeft: item.level === 2 ? '2px solid #d9d6ee' : item.level === 3 ? '2px solid #e4e2f7' : 'none',
                marginLeft: item.level === 2 ? 16 : item.level === 3 ? 32 : 0,
                background: item.level === 1 ? '#faf9fe' : 'transparent',
                boxShadow: dropTarget === item.code ? 'inset 0 2px #6b6987' : 'none',
                opacity: draggedCode === item.code ? 0.45 : 1,
                cursor: item.level > 1 ? 'grab' : 'default',
              }}
            >
              <span className="flex items-center gap-2" style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6b6987' }}>
                <span
                  aria-hidden="true"
                  title={item.level > 1 ? 'Drag (or Alt+↑/↓) to reorder' : undefined}
                  style={{ color: item.level > 1 ? '#999' : 'transparent', letterSpacing: -2, userSelect: 'none' }}
                >
                  ⋮⋮
                </span>
                {item.code}
              </span>
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
              <span style={{ fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6b6987' }}>{item.duration || '—'}</span>
              <span style={{ fontSize: 12, color: '#5a5878' }}>{item.owner || '—'}</span>
              <div className="flex gap-4">
                <button style={{ fontSize: 11, color: '#5a5878', border: '1px solid #e0e0e0', borderRadius: 3, padding: '2px 7px', background: '#faf9fe', cursor: 'pointer' }}>Edit</button>
                {item.level < 3 && (
                  <button style={{ fontSize: 11, color: '#5a5878', border: '1px solid #e0e0e0', borderRadius: 3, padding: '2px 7px', background: '#faf9fe', cursor: 'pointer' }}>+ Sub</button>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* AI Validation panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={cardStyle}>
            <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>AI Validation</div>
              <span style={{ fontSize: 10, color: '#6b6987' }}>{lastValidated}</span>
            </div>
            <div style={{ fontSize: 12, color: '#3f8a6a', fontWeight: 500, marginBottom: 10 }}>WBS structure is valid (3 levels)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {AI_ISSUES.map((issue, i) => (
                <div key={i} style={{ padding: '8px 10px', background: issueColor[issue.type] || '#f4f2fc', borderRadius: 4, borderLeft: `3px solid ${issueTag[issue.type]}` }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: issueTag[issue.type], textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
                    {issue.type}
                  </div>
                  <div style={{ fontSize: 12, color: '#38375a', lineHeight: 1.5 }}>{issue.text}</div>
                </div>
              ))}
            </div>
            <button onClick={validateWbs} disabled={validating} style={{ ...secondaryBtn, width: '100%', marginTop: 12, fontSize: 12 }}>
              {validating ? 'Validating WBS…' : 'AI Validate'}
            </button>
          </div>

          <div style={cardStyle}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>WBS Summary</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, color: '#5a5878' }}>
              {[
                ['Level 1 (Project)', '1'],
                ['Level 2 (Deliverables)', '5'],
                ['Level 3 (Work Packages)', '14'],
                ['Total Work Packages', '14'],
                ['Unassigned Packages', '2'],
                ['Estimated Weeks', '38w total'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between" style={{ paddingBottom: 5, borderBottom: '1px solid #eeecf9' }}>
                  <span>{k}</span>
                  <span style={{ fontFamily: 'DM Mono, monospace', fontWeight: 500, color: '#23223a' }}>{v}</span>
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

const LINE = '#b9b4e3'

function OrgChart({ wbs, selectedCode, onSelect, onToggle }: {
  wbs: WBSItem[]
  selectedCode: string
  onSelect: (c: string) => void
  onToggle: (c: string) => void
}) {
  const root = wbs.find(i => i.level === 1)!
  const deliverables = wbs.filter(i => i.level === 2)
  const packages = (code: string) => wbs.filter(i => i.level === 3 && i.code.startsWith(code + '.'))
  const unassigned = (i: WBSItem) => !i.owner || i.owner === 'Unassigned'

  const selectable = (code: string) => ({
    role: 'button',
    tabIndex: 0,
    'aria-pressed': selectedCode === code,
    onClick: () => onSelect(code),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (event.target !== event.currentTarget || (event.key !== 'Enter' && event.key !== ' ')) return
      event.preventDefault()
      onSelect(code)
    },
  })

  const nodeBase: React.CSSProperties = { borderRadius: 8, padding: '8px 10px', textAlign: 'center', cursor: 'pointer', position: 'relative' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 'max-content', padding: '4px 8px 12px' }}>
      <div
        {...selectable(root.code)}
        style={{ ...nodeBase, background: '#4b4a9e', color: '#fff', width: 220, outline: selectedCode === root.code ? '3px solid #c9c6ee' : 'none' }}
      >
        <div className="mono" style={{ fontSize: 10, opacity: 0.8 }}>{root.code}</div>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{root.name}</div>
      </div>

      {root.expanded && (
        <>
          <div style={{ width: 2, height: 22, background: LINE }} />
          <div style={{ display: 'flex' }}>
            {deliverables.map((d, idx) => {
              const kids = packages(d.code)
              const first = idx === 0
              const last = idx === deliverables.length - 1
              return (
                <div key={d.code} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 7px', position: 'relative', width: 178 }}>
                  <div style={{ position: 'absolute', top: 0, left: first ? '50%' : 0, right: last ? '50%' : 0, height: 2, background: LINE, display: deliverables.length === 1 ? 'none' : 'block' }} />
                  <div style={{ width: 2, height: 20, background: LINE }} />
                  <div
                    {...selectable(d.code)}
                    style={{ ...nodeBase, background: '#e4e2f7', color: '#23223a', width: '100%', outline: selectedCode === d.code ? '3px solid #4b4a9e55' : 'none', border: '1px solid #cfcbee' }}
                  >
                    <div className="mono" style={{ fontSize: 10, color: '#6b6987' }}>{d.code}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.3 }}>{d.name}</div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggle(d.code) }}
                      style={{ marginTop: 4, fontSize: 10, color: '#4b4a9e', background: '#fff', border: '1px solid #cfcbee', borderRadius: 10, padding: '1px 8px', cursor: 'pointer' }}
                    >
                      {d.expanded ? '− ' : '+ '}{kids.length} packages
                    </button>
                  </div>

                  {d.expanded && kids.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', paddingLeft: 14, marginTop: 0, position: 'relative' }}>
                      <div style={{ position: 'absolute', left: 6, top: 0, bottom: 22, width: 2, background: LINE }} />
                      {kids.map(k => (
                        <div key={k.code} style={{ display: 'flex', alignItems: 'center', marginTop: 10, position: 'relative' }}>
                          <div style={{ position: 'absolute', left: -8, width: 10, height: 2, background: LINE }} />
                          <div
                            {...selectable(k.code)}
                            style={{ ...nodeBase, flex: 1, textAlign: 'left', background: unassigned(k) ? '#fdeedd' : '#dcf3e8', color: '#23223a', fontSize: 11, lineHeight: 1.35, outline: selectedCode === k.code ? '3px solid #4b4a9e55' : 'none', padding: '6px 8px' }}
                          >
                            <div className="flex justify-between mono" style={{ fontSize: 10, color: '#6b6987' }}>
                              <span>{k.code}</span><span>{k.duration}</span>
                            </div>
                            <div style={{ fontWeight: 500 }}>{k.name}</div>
                            <div style={{ fontSize: 10, color: '#5a5878', marginTop: 2 }}>{k.owner}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      <div className="flex gap-4" style={{ marginTop: 18, fontSize: 11, color: '#6b6987' }}>
        {[['#4b4a9e', 'Project'], ['#e4e2f7', 'Deliverable'], ['#dcf3e8', 'Assigned package'], ['#fdeedd', 'Unassigned package']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block', border: '1px solid #cfcbee' }} />{l}</span>
        ))}
      </div>
    </div>
  )
}

function Breadcrumb({ steps }: { steps: string[] }) {
  return (
    <div className="flex items-center gap-2" style={{ fontSize: 12, color: '#6b6987', marginBottom: 20 }}>
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
