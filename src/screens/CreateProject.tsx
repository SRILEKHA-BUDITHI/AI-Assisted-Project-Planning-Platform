import type { Screen } from '../App'

interface Props { nav: (s: Screen) => void }

export default function CreateProject({ nav }: Props) {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 800 }}>
      <Breadcrumb steps={['Dashboard', 'Create Project']} />

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 22, fontWeight: 700 }}>Create New Project</div>
        <div style={{ fontSize: 13, color: '#737373', marginTop: 2 }}>
          Define the basic parameters for your project. AI will use this context during intake.
        </div>
      </div>

      <div style={cardStyle}>
        <SectionLabel>Project Identity</SectionLabel>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Project Name" required>
            <input defaultValue="Enterprise Data Platform" style={inputStyle} />
          </Field>
          <Field label="Project Type">
            <select style={inputStyle}>
              <option>Technology / IT</option>
              <option>Construction</option>
              <option>Product Development</option>
              <option>Business Process</option>
              <option>Compliance / Regulatory</option>
            </select>
          </Field>
        </div>

        <Field label="Project Description" required>
          <textarea
            defaultValue="Build a centralized data platform to consolidate reporting, enable real-time analytics, and replace legacy BI tools across all business units."
            style={{ ...inputStyle, minHeight: 80, resize: 'vertical' }}
          />
        </Field>

        <SectionLabel style={{ marginTop: 24 }}>Timeline & Budget</SectionLabel>

        <div className="grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 16 }}>
          <Field label="Start Date" required>
            <input type="date" defaultValue="2025-01-15" style={inputStyle} />
          </Field>
          <Field label="Target End Date" required>
            <input type="date" defaultValue="2025-09-30" style={inputStyle} />
          </Field>
          <Field label="Total Budget ($)" required>
            <input type="text" defaultValue="375,000" style={inputStyle} />
          </Field>
        </div>

        <SectionLabel style={{ marginTop: 24 }}>Team & Ownership</SectionLabel>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <Field label="Project Manager">
            <select style={inputStyle}>
              <option>Jane Doe</option>
              <option>Mark Chen</option>
              <option>Sara Kim</option>
            </select>
          </Field>
          <Field label="Department / Business Unit">
            <select style={inputStyle}>
              <option>Engineering</option>
              <option>Operations</option>
              <option>Finance</option>
              <option>Product</option>
            </select>
          </Field>
        </div>

        <Field label="Sponsor / Executive Owner">
          <input defaultValue="VP of Engineering — Robert Walsh" style={inputStyle} />
        </Field>

        <SectionLabel style={{ marginTop: 24 }}>Classification</SectionLabel>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 8 }}>
          <Field label="Priority">
            <select style={inputStyle}>
              <option>High</option>
              <option>Medium</option>
              <option>Low</option>
            </select>
          </Field>
          <Field label="Methodology">
            <select style={inputStyle}>
              <option>Waterfall</option>
              <option>Agile / Scrum</option>
              <option>Hybrid</option>
              <option>Kanban</option>
            </select>
          </Field>
          <Field label="Visibility">
            <select style={inputStyle}>
              <option>Internal</option>
              <option>Client-Facing</option>
              <option>Confidential</option>
            </select>
          </Field>
        </div>
      </div>

      <div className="flex items-center justify-between" style={{ marginTop: 24 }}>
        <button
          onClick={() => nav('dashboard')}
          style={secondaryBtn}
        >
          ← Back to Dashboard
        </button>
        <div className="flex gap-3">
          <button style={secondaryBtn}>Save Draft</button>
          <button
            onClick={() => nav('ai-intake')}
            style={primaryBtn}
          >
            Continue to AI Intake →
          </button>
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

function SectionLabel({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color: '#737373', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #f0f0f0', ...style }}>
      {children}
    </div>
  )
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 5, color: '#3a3a3a' }}>
        {label}{required && <span style={{ color: '#999', marginLeft: 2 }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e8e8e8', borderRadius: 6, padding: '24px 24px' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', border: '1px solid #d4d4d4', borderRadius: 4, fontSize: 13, background: '#fff', color: '#1a1a1a', outline: 'none', fontFamily: 'inherit' }
const primaryBtn: React.CSSProperties = { padding: '9px 20px', background: '#2d2d2d', color: '#fff', border: 'none', borderRadius: 4, fontSize: 13, fontWeight: 600, cursor: 'pointer' }
const secondaryBtn: React.CSSProperties = { padding: '9px 16px', background: '#fff', color: '#3a3a3a', border: '1px solid #d4d4d4', borderRadius: 4, fontSize: 13, cursor: 'pointer' }
