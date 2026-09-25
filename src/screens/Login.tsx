interface Props { onLogin: () => void }

export default function Login({ onLogin }: Props) {
  return (
    <div className="min-h-screen flex" style={{ background: '#f7f7f7' }}>
      {/* Left panel */}
      <div
        className="flex flex-col justify-between"
        style={{ width: 420, background: '#2d2d2d', color: '#fff', padding: '48px 48px' }}
      >
        <div>
          <div className="flex items-center gap-2 mb-12">
            <div style={{ width: 32, height: 32, background: '#555', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>AI</div>
            <span style={{ fontSize: 16, fontWeight: 600 }}>ProjectAI</span>
          </div>
          <div style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.3, marginBottom: 16 }}>
            AI-Assisted Project Planning Platform
          </div>
          <div style={{ fontSize: 14, color: '#999', lineHeight: 1.7 }}>
            Plan projects intelligently. AI extracts scope, builds WBS structures, and optimizes resource allocation automatically.
          </div>
        </div>
        <div style={{ fontSize: 12, color: '#666' }}>© 2024 ProjectAI Inc.</div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center">
        <div style={{ width: 360 }}>
          <div style={{ marginBottom: 32 }}>
            <div style={{ fontSize: 22, fontWeight: 700, marginBottom: 6 }}>Sign in</div>
            <div style={{ fontSize: 14, color: '#737373' }}>Access your project workspace</div>
          </div>

          <Field label="Email address">
            <input
              type="email"
              defaultValue="jane.doe@company.com"
              style={inputStyle}
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              defaultValue="••••••••••"
              style={inputStyle}
            />
          </Field>

          <div className="flex items-center justify-between" style={{ marginBottom: 24 }}>
            <label className="flex items-center gap-2" style={{ fontSize: 13, color: '#555', cursor: 'pointer' }}>
              <input type="checkbox" defaultChecked /> Remember me
            </label>
            <button style={{ fontSize: 13, color: '#2d2d2d', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Forgot password?
            </button>
          </div>

          <button
            onClick={onLogin}
            style={{
              width: '100%',
              padding: '11px',
              background: '#2d2d2d',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              marginBottom: 16,
            }}
          >
            Sign in
          </button>

          <div style={{ textAlign: 'center', fontSize: 13, color: '#999' }}>
            — or —
          </div>

          <button
            onClick={onLogin}
            style={{
              width: '100%',
              marginTop: 16,
              padding: '11px',
              background: '#fff',
              color: '#2d2d2d',
              border: '1px solid #d4d4d4',
              borderRadius: 4,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Continue with SSO
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6, color: '#3a3a3a', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '9px 12px',
  border: '1px solid #d4d4d4',
  borderRadius: 4,
  fontSize: 14,
  background: '#fff',
  color: '#1a1a1a',
  outline: 'none',
}
