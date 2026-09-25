import type { Screen } from '../App'

const NAV_ITEMS: { label: string; screen: Screen; flow?: boolean }[] = [
  { label: 'Dashboard', screen: 'dashboard' },
  { label: 'Create Project', screen: 'create-project', flow: true },
  { label: 'AI Project Intake', screen: 'ai-intake', flow: true },
  { label: 'Scope Review', screen: 'scope-review', flow: true },
  { label: 'WBS Builder', screen: 'wbs-builder', flow: true },
  { label: 'Constraints', screen: 'constraints', flow: true },
  { label: 'Optimization Results', screen: 'optimization-results', flow: true },
]

interface Props {
  currentScreen: Screen
  nav: (s: Screen) => void
  children: React.ReactNode
}

export default function Shell({ currentScreen, nav, children }: Props) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--background)' }}>
      {/* Sidebar */}
      <aside
        className="flex flex-col shrink-0"
        style={{
          width: 220,
          background: 'var(--primary)',
          color: 'var(--primary-foreground)',
          borderRight: '1px solid #111',
        }}
      >
        {/* Logo */}
        <div className="px-5 py-5" style={{ borderBottom: '1px solid #444' }}>
          <div className="flex items-center gap-2">
            <div
              style={{
                width: 28,
                height: 28,
                background: '#555',
                borderRadius: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              AI
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>ProjectAI</div>
              <div style={{ fontSize: 10, color: '#999', lineHeight: 1.2 }}>Planning Platform</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 overflow-y-auto">
          <div style={{ fontSize: 10, color: '#777', paddingLeft: 20, marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Navigation
          </div>
          {NAV_ITEMS.map((item) => {
            const active = currentScreen === item.screen
            return (
              <button
                key={item.screen}
                onClick={() => nav(item.screen)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '8px 20px',
                  fontSize: 13,
                  fontWeight: active ? 600 : 400,
                  background: active ? '#444' : 'transparent',
                  color: active ? '#fff' : '#bbb',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: 8,
                  transition: 'background 0.1s',
                }}
                onMouseEnter={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = '#333'
                }}
                onMouseLeave={(e) => {
                  if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
                }}
              >
                {item.flow && (
                  <span style={{ color: '#666', fontSize: 10, marginLeft: 4, fontFamily: 'DM Mono, monospace' }}>
                    {NAV_ITEMS.filter(n => n.flow).findIndex(n => n.screen === item.screen) + 1 + '.'}
                  </span>
                )}
                {item.label}
              </button>
            )
          })}
        </nav>

        {/* User */}
        <div className="px-5 py-4" style={{ borderTop: '1px solid #444' }}>
          <div className="flex items-center gap-2">
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#555', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              JD
            </div>
            <div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>Jane Doe</div>
              <div style={{ fontSize: 10, color: '#888' }}>Project Manager</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
