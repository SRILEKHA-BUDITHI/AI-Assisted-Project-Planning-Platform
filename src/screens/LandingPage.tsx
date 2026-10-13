import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { APP_NAME, BrandMark, BrandName } from '@/components/Brand'

const FEATURES = [
  { tag: 'AI', title: 'AI Project Intake', text: 'Drop in meeting transcripts, PDFs, Word files and audio. AI extracts goals, scope, stakeholders and assumptions for your review.', bg: '#E8DCC6' },
  { tag: 'WBS', title: 'WBS / PBS / OBS / RACI', text: 'Generate linked work, product and organizational breakdown structures, with responsibility matrices built from the same model.', bg: '#DDE7D0' },
  { tag: 'RSK', title: 'Risk Management', text: 'Surface risks from your scope and constraints, rate impact and likelihood, and tie mitigations to the work packages they affect.', bg: '#F3D9D5' },
  { tag: 'OPT', title: 'Optimization Engine', text: 'Solve resource allocation and scheduling against budget, deadline, capacity and skill constraints with OR-Tools, and compare feasible scenarios.', bg: '#F5E3C8' },
  { tag: 'TRC', title: 'Traceability', text: 'Follow every task back to the requirement, meeting or document it came from, and see what changes when a source changes.', bg: '#E3DCCB' },
  { tag: 'GOV', title: 'AI Governance', text: 'AI proposes, people decide. Every AI suggestion is logged, reviewable and requires explicit human approval before it enters the plan.', bg: '#E8DCC6' },
]

const STEPS = [
  ['Project Information', 'Meetings, documents and requirements'],
  ['AI Analysis', 'Scope, deliverables and gaps extracted'],
  ['Structured Project Model', 'WBS, PBS, OBS and RACI'],
  ['Constraints & Risk', 'Hard and soft limits, risk register'],
  ['Optimization', 'OR-Tools scheduling and allocation'],
  ['Human Approval', 'Review, adjust and sign off'],
  ['Execution & Monitoring', 'Track progress against the plan'],
] as const

const SECTIONS = [
  ['About', 'about'],
  ['Features', 'features'],
  ['How It Works', 'how'],
] as const

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

/* Animation styles, scoped with the `nr-` prefix. */
const CSS = `
@keyframes nr-up { from { opacity:0; transform:translateY(16px); filter:blur(6px) } to { opacity:1; transform:none; filter:blur(0) } }
@keyframes nr-pop { from { opacity:0; transform:translateX(-12px) scale(.96) } to { opacity:1; transform:none } }
@keyframes nr-draw { to { stroke-dashoffset:0 } }
@keyframes nr-fade { from { opacity:0 } to { opacity:1 } }
@keyframes nr-march { to { stroke-dashoffset:-16 } }
@keyframes nr-glow { 0%,100% { opacity:.25 } 50% { opacity:.8 } }
@keyframes nr-float { 0%,100% { transform:translateY(0) } 50% { transform:translateY(-7px) } }
@keyframes nr-drift { 0%,100% { transform:translate(0,0) scale(1) } 50% { transform:translate(40px,-30px) scale(1.1) } }
@keyframes nr-shine { to { background-position:200% center } }
@keyframes nr-ring { 0% { box-shadow:0 0 0 0 rgba(114,47,55,.45) } 100% { box-shadow:0 0 0 12px rgba(114,47,55,0) } }
@keyframes nr-dot { 0%,100% { opacity:1 } 50% { opacity:.35 } }

.nr-in { opacity:0; animation:nr-up .9s cubic-bezier(.2,.8,.2,1) both; }

.nr-hero-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.1fr); gap:40px; align-items:center; }
.nr-about-grid { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.4fr); gap:48px; }
@media (max-width: 900px) {
  .nr-hero-grid, .nr-about-grid { grid-template-columns:1fr; gap:32px; }
  .nr-h1 { font-size:38px !important; }
}

.nr-grad {
  background:linear-gradient(90deg,#722F37 0%,#B4544C 25%,#722F37 50%,#B4544C 75%,#722F37 100%);
  background-size:200% auto;
  -webkit-background-clip:text; background-clip:text; color:transparent;
}
.nr-grad.nr-in { animation:nr-up .9s cubic-bezier(.2,.8,.2,1) both, nr-shine 8s linear 1.4s infinite; }

.nr-tree { animation:nr-float 8s ease-in-out 3.5s infinite; }
.nr-node { opacity:0; animation:nr-pop .65s cubic-bezier(.2,.8,.2,1) forwards; transform-box:fill-box; transform-origin:left center; }
.nr-link { fill:none; stroke-dasharray:1; stroke-dashoffset:1; animation:nr-draw .7s cubic-bezier(.4,0,.2,1) forwards; }
.nr-ai-link { fill:none; opacity:0; stroke-dasharray:4 4; animation:nr-fade .4s ease forwards, nr-march 1s linear infinite; }
.nr-ai-glow { opacity:0; animation:nr-glow 2.4s ease-in-out infinite; }
.nr-chip { opacity:0; animation:nr-up .8s cubic-bezier(.2,.8,.2,1) both; }
.nr-chip-inner { animation:nr-float 6s ease-in-out infinite; }
.nr-live { animation:nr-dot 1.6s ease-in-out infinite; }

.nr-blob { position:absolute; border-radius:50%; filter:blur(60px); pointer-events:none; animation:nr-drift 18s ease-in-out infinite; }

.nr-header { transition:box-shadow .3s ease, background .3s ease; }
.nr-header.is-scrolled { box-shadow:0 10px 30px -20px rgba(46,26,29,.45); background:rgba(246,239,226,.97) !important; }
.nr-navlink { position:relative; }
.nr-navlink::after { content:""; position:absolute; left:0; right:0; bottom:-4px; height:1.5px; background:#722F37; transform:scaleX(0); transform-origin:left; transition:transform .3s cubic-bezier(.2,.8,.2,1); }
.nr-navlink:hover::after { transform:scaleX(1); }

.nr-btn { display:inline-flex; align-items:center; justify-content:center; text-decoration:none; transition:transform .2s ease, box-shadow .2s ease, background .2s ease; }
.nr-btn:hover { transform:translateY(-1px); }
.nr-btn-p:hover { box-shadow:0 10px 24px -10px rgba(114,47,55,.7); }
.nr-btn:focus-visible, .nr-navlink:focus-visible, .nr-home:focus-visible { outline:2px solid #722F37; outline-offset:3px; }
.nr-cta .nr-btn:focus-visible { outline-color:#fff; }

.nr-card { position:relative; overflow:hidden; transition:transform .35s cubic-bezier(.2,.8,.2,1), box-shadow .35s ease, border-color .35s ease; }
.nr-card::before { content:""; position:absolute; inset:0; pointer-events:none; opacity:0; transition:opacity .35s ease;
  background:radial-gradient(280px circle at var(--mx,50%) var(--my,50%), rgba(114,47,55,.09), transparent 65%); }
.nr-card:hover { transform:translateY(-4px); border-color:#CDBFAB !important; box-shadow:0 20px 40px -24px rgba(114,47,55,.5); }
.nr-card:hover::before { opacity:1; }
.nr-tag { transition:transform .35s cubic-bezier(.2,.8,.2,1); }
.nr-card:hover .nr-tag { transform:rotate(-6deg) scale(1.08); }

.nr-track { height:2px; background:#CDBFAB; border-radius:2px; overflow:hidden; margin-bottom:28px; }
.nr-track > span { display:block; height:100%; background:#722F37; transform:scaleX(0); transform-origin:left; transition:transform 2.4s cubic-bezier(.4,0,.2,1); }
.nr-steps.is-on .nr-track > span { transform:scaleX(1); }
.nr-step { opacity:.35; transform:translateY(10px); transition:opacity .6s ease, transform .6s cubic-bezier(.2,.8,.2,1), box-shadow .3s ease; transition-delay:var(--d,0ms); }
.nr-steps.is-on .nr-step { opacity:1; transform:none; }
.nr-steps.is-on .nr-stepnum { animation:nr-ring 1.2s ease-out var(--d,0ms) 1; }
.nr-step:hover { box-shadow:0 14px 30px -20px rgba(114,47,55,.55); }

@media (max-width: 640px) {
  .nr-pad { padding-left:16px !important; padding-right:16px !important; }
  .nr-chip-hide { display:none; }
}

@media (prefers-reduced-motion: reduce) {
  .nr-root *, .nr-root *::before, .nr-root *::after { animation-duration:.01ms !important; animation-delay:0ms !important; animation-iteration-count:1 !important; transition-duration:.01ms !important; transition-delay:0ms !important; }
  .nr-smil, .nr-blob { display:none; }
  .nr-ai-glow { opacity:.4; }
}
`

const primaryBtn: CSSProperties = { padding: '9px 20px', background: '#722F37', color: '#fff', border: 'none', borderRadius: 4, fontSize: 14, fontWeight: 600, cursor: 'pointer' }
const ghostBtn: CSSProperties = { padding: '9px 18px', background: '#fff', color: '#722F37', border: '1px solid #CDBFAB', borderRadius: 4, fontSize: 14, fontWeight: 500, cursor: 'pointer' }
const large: CSSProperties = { padding: '13px 28px', fontSize: 15 }

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function spotlight(e: MouseEvent<HTMLDivElement>) {
  const r = e.currentTarget.getBoundingClientRect()
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`)
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`)
}

/** Public marketing page at `/`. Signed-in visitors get a shortcut to their dashboard. */
export default function LandingPage() {
  const { session } = useAuth()
  const signedIn = Boolean(session)
  const [scrolled, setScrolled] = useState(false)
  const [stepsOn, setStepsOn] = useState(false)
  const stepsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    document.title = `${APP_NAME} — AI Project Planning`
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => {
    const el = stepsRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setStepsOn(true)
          io.disconnect()
        }
      },
      { threshold: 0.3 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const headWords = 'Turn Project Ideas Into'.split(' ')

  return (
    <div className="nr-root" style={{ background: '#F6EFE2', color: '#2E1A1D', minHeight: '100vh' }}>
      <style>{CSS}</style>

      <header
        className={`nr-header sticky top-0 z-10 ${scrolled ? 'is-scrolled' : ''}`}
        style={{ background: 'rgba(246,239,226,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #CDBFAB' }}
      >
        <div
          className="nr-pad mx-auto flex items-center justify-between gap-3"
          style={{ maxWidth: 1120, padding: scrolled ? '10px 32px' : '14px 32px', transition: 'padding .3s ease' }}
        >
          <Link to="/" className="nr-home flex items-center gap-2 rounded-md" style={{ color: '#2E1A1D', textDecoration: 'none' }}>
            <BrandMark />
            <BrandName className="text-base" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-3 sm:gap-6" style={{ fontSize: 14 }}>
            {SECTIONS.map(([label, id]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className="nr-navlink hidden transition-colors hover:text-[#722F37] md:block"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#4A2B2F' }}
              >
                {label}
              </button>
            ))}
            <AuthButtons signedIn={signedIn} />
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section style={{ position: 'relative', overflow: 'hidden' }}>
          <div aria-hidden="true" className="nr-blob" style={{ width: 420, height: 420, right: -80, top: 40, background: '#E8C9C4', opacity: 0.55 }} />
          <div aria-hidden="true" className="nr-blob" style={{ width: 360, height: 360, left: '38%', bottom: -160, background: '#DDE7D0', opacity: 0.6, animationDelay: '-9s' }} />
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'radial-gradient(#CDBFAB 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              opacity: 0.45,
              maskImage: 'radial-gradient(ellipse 55% 60% at 75% 50%, #000 20%, transparent 75%)',
              WebkitMaskImage: 'radial-gradient(ellipse 55% 60% at 75% 50%, #000 20%, transparent 75%)',
              pointerEvents: 'none',
            }}
          />

          <div className="nr-pad mx-auto" style={{ maxWidth: 1120, padding: '88px 32px 72px', position: 'relative' }}>
            <div className="nr-hero-grid">
              <div>
                <span
                  className="nr-in"
                  style={{ display: 'inline-block', fontSize: 12, fontWeight: 600, color: '#722F37', background: '#E8DCC6', padding: '4px 12px', borderRadius: 20, marginBottom: 20, animationDelay: '0.05s' }}
                >
                  AI-Assisted Project Planning Platform
                </span>
                <h1 className="nr-h1" style={{ fontSize: 48, lineHeight: 1.1, fontWeight: 700, letterSpacing: '-0.025em', margin: 0 }}>
                  {headWords.map((word, i) => (
                    <span key={word} className="nr-in" style={{ display: 'inline-block', marginRight: '0.25em', animationDelay: `${0.15 + i * 0.07}s` }}>
                      {word}
                    </span>
                  ))}
                  <span className="nr-in nr-grad" style={{ display: 'inline-block', animationDelay: `${0.15 + headWords.length * 0.07}s` }}>
                    Structured, Optimized Plans
                  </span>
                </h1>
                <p className="nr-in" style={{ fontSize: 17, lineHeight: 1.65, color: '#6B5254', margin: '20px 0 32px', maxWidth: 520, animationDelay: '0.6s' }}>
                  {APP_NAME} uses AI to transform meetings, documents and requirements into structured project plans, then
                  applies optimization for resource allocation, scheduling and decision support.
                </p>
                <div className="nr-in flex flex-wrap gap-3" style={{ animationDelay: '0.75s' }}>
                  <AuthButtons signedIn={signedIn} size="large" />
                </div>
              </div>

              <HeroTree />
            </div>
          </div>
        </section>

        {/* About */}
        <section id="about" style={{ background: '#fff', borderTop: '1px solid #E8DCC6', borderBottom: '1px solid #E8DCC6', scrollMarginTop: 64 }}>
          <div className="nr-pad mx-auto" style={{ maxWidth: 1120, padding: '64px 32px' }}>
            <div className="nr-about-grid">
              <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', margin: 0, lineHeight: 1.2 }}>Planning shouldn't start from a blank page.</h2>
              <p style={{ fontSize: 16, lineHeight: 1.7, color: '#6B5254', margin: 0 }}>
                Project knowledge is scattered across calls, documents and inboxes. {APP_NAME} gathers it, builds a structured
                and traceable project model, and uses mathematical optimization to test what is actually feasible. AI does the
                heavy lifting, and your team keeps the final say.
              </p>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="nr-pad mx-auto" style={{ maxWidth: 1120, padding: '80px 32px', scrollMarginTop: 64 }}>
          <SectionHead eyebrow="Features" title="Everything between idea and approved plan" />
          <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))' }}>
            {FEATURES.map((f) => (
              <div key={f.title} className="nr-card" onMouseMove={spotlight} style={{ background: '#fff', border: '1px solid #E8DCC6', borderRadius: 10, padding: 24 }}>
                <div
                  className="mono nr-tag flex items-center justify-center"
                  style={{ width: 40, height: 40, borderRadius: 8, background: f.bg, fontSize: 11, fontWeight: 600, color: '#4A2B2F', marginBottom: 16 }}
                >
                  {f.tag}
                </div>
                <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 8px' }}>{f.title}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.6, color: '#6B5254', margin: 0 }}>{f.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* How it works */}
        <section id="how" style={{ background: '#E8DCC6', borderTop: '1px solid #CDBFAB', borderBottom: '1px solid #CDBFAB', scrollMarginTop: 64 }}>
          <div ref={stepsRef} className={`nr-steps nr-pad mx-auto ${stepsOn ? 'is-on' : ''}`} style={{ maxWidth: 1120, padding: '80px 32px' }}>
            <SectionHead eyebrow="How It Works" title="From raw input to monitored execution" />
            <div className="nr-track" aria-hidden="true">
              <span />
            </div>
            <ol className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', listStyle: 'none', padding: 0, margin: 0 }}>
              {STEPS.map(([title, description], i) => (
                <li
                  key={title}
                  className="nr-step"
                  style={{ '--d': `${i * 300}ms`, background: '#fff', border: '1px solid #CDBFAB', borderRadius: 10, padding: '18px 20px', position: 'relative' } as CSSProperties}
                >
                  <span
                    className="mono nr-stepnum flex items-center justify-center"
                    style={{ width: 26, height: 26, borderRadius: '50%', background: '#722F37', color: '#fff', fontSize: 12, marginBottom: 12 }}
                  >
                    {i + 1}
                  </span>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{title}</div>
                  <div style={{ fontSize: 13, color: '#6B5254', lineHeight: 1.5 }}>{description}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Call to action */}
        <section className="nr-pad mx-auto" style={{ maxWidth: 1120, padding: '80px 32px' }}>
          <div className="nr-cta" style={{ background: '#722F37', color: '#fff', borderRadius: 16, padding: '56px 24px', textAlign: 'center' }}>
            <h2 style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-0.02em', margin: '0 0 10px' }}>Ready to structure your next project?</h2>
            <p style={{ fontSize: 15, color: '#CDBFAB', margin: '0 0 28px' }}>Create a workspace and turn your first meeting notes into a plan.</p>
            <div className="flex flex-wrap justify-center gap-3">
              {signedIn ? (
                <Link to="/dashboard" className="nr-btn" style={{ ...primaryBtn, ...large, background: '#fff', color: '#722F37' }}>
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="nr-btn" style={{ ...primaryBtn, ...large, background: '#fff', color: '#722F37' }}>
                    Create Account
                  </Link>
                  <Link to="/login" className="nr-btn" style={{ ...large, background: 'transparent', color: '#fff', border: '1px solid #ffffff88', borderRadius: 4 }}>
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer style={{ borderTop: '1px solid #CDBFAB', padding: '24px 32px', textAlign: 'center', fontSize: 12, color: '#7A6063' }}>
        © {new Date().getFullYear()} {APP_NAME} Inc.
      </footer>
    </div>
  )
}

function AuthButtons({ signedIn, size }: { signedIn: boolean; size?: 'large' }) {
  const extra = size === 'large' ? large : undefined
  if (signedIn) {
    return (
      <Link to="/dashboard" className="nr-btn nr-btn-p" style={{ ...primaryBtn, ...extra }}>
        Go to Dashboard
      </Link>
    )
  }
  const signUp = (
    <Link key="signup" to="/signup" className="nr-btn nr-btn-p" style={{ ...primaryBtn, ...extra }}>
      Get Started
    </Link>
  )
  const signIn = (
    <Link key="login" to="/login" className="nr-btn" style={{ ...ghostBtn, ...extra }}>
      Sign In
    </Link>
  )
  // Header shows Sign In first; the hero leads with the primary action.
  return <>{size === 'large' ? [signUp, signIn] : [signIn, signUp]}</>
}

/* Hero: a WBS that builds itself, with an AI-suggested branch awaiting approval. */

const ROOT = { x: 0, y: 165, w: 176, h: 54, cy: 192 }
const CHILD_X = 216
const CHILD_W = 180
const LEAF_X = 440
const LEAF_W = 140
const AI_CY = 330

const BRANCHES: { id: string; label: string; cy: number; leaves: [string, number][] }[] = [
  { id: '1.1', label: 'Data Ingestion Layer', cy: 75, leaves: [['Salesforce connector', 40], ['SAP integration', 110]] },
  { id: '1.2', label: 'Data Warehouse & ETL', cy: 210, leaves: [['Schema design', 175], ['ETL pipelines', 245]] },
]

const rootLink = (cy: number) => `M${ROOT.x + ROOT.w} ${ROOT.cy} C${ROOT.w + 22} ${ROOT.cy} ${CHILD_X - 22} ${cy} ${CHILD_X} ${cy}`
const leafLink = (cy: number, ly: number) => {
  const sx = CHILD_X + CHILD_W
  return `M${sx} ${cy} C${sx + 22} ${cy} ${LEAF_X - 22} ${ly} ${LEAF_X} ${ly}`
}

/** Build order timing, in seconds. */
const T = { root: 0.5, link1: 0.9, child: 1.2, link2: 1.6, leaf: 1.9, aiLink: 2.7, aiChild: 3.0, aiLeafLink: 3.3, aiLeaf: 3.5, flow: 3.8 }

function HeroTree() {
  const flowPaths = BRANCHES.flatMap((b) => [rootLink(b.cy), ...b.leaves.map(([, ly]) => leafLink(b.cy, ly))]).filter((_, i) => i % 2 === 0)

  return (
    <div style={{ position: 'relative' }}>
      <div className="nr-tree">
        <svg
          viewBox="0 0 584 380"
          width="100%"
          role="img"
          aria-label="Example work breakdown structure being generated, with an AI-suggested disaster recovery package"
          style={{ display: 'block', overflow: 'visible' }}
        >
          <defs>
            <filter id="nr-shadow" x="-20%" y="-30%" width="140%" height="180%">
              <feDropShadow dx="0" dy="6" stdDeviation="8" floodColor="#722F37" floodOpacity="0.14" />
            </filter>
            <linearGradient id="nr-scan" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#722F37" stopOpacity="0" />
              <stop offset="0.5" stopColor="#722F37" stopOpacity="0.12" />
              <stop offset="1" stopColor="#722F37" stopOpacity="0" />
            </linearGradient>
            <clipPath id="nr-scan-clip">
              <rect x="0" y="0" width="584" height="380" />
            </clipPath>
          </defs>

          {/* AI scan sweep, clipped to the tree so it never lingers past the edge */}
          <g clipPath="url(#nr-scan-clip)">
            <rect className="nr-smil" x="-120" y="0" width="120" height="380" fill="url(#nr-scan)">
              <animate attributeName="x" values="-120;600;600" keyTimes="0;0.45;1" dur="7s" begin="2.2s" repeatCount="indefinite" />
            </rect>
          </g>

          {BRANCHES.map((b, bi) => (
            <g key={b.id}>
              <path className="nr-link" d={rootLink(b.cy)} pathLength={1} stroke="#B9A48C" strokeWidth={1.5} style={{ animationDelay: `${T.link1 + bi * 0.12}s` }} />
              {b.leaves.map(([name, ly], li) => (
                <path
                  key={name}
                  className="nr-link"
                  d={leafLink(b.cy, ly)}
                  pathLength={1}
                  stroke="#B9A48C"
                  strokeWidth={1.5}
                  style={{ animationDelay: `${T.link2 + bi * 0.2 + li * 0.1}s` }}
                />
              ))}
            </g>
          ))}
          <path className="nr-ai-link" d={rootLink(AI_CY)} stroke="#a8691f" strokeWidth={1.5} style={{ animationDelay: `${T.aiLink}s, ${T.aiLink}s` }} />
          <path className="nr-ai-link" d={leafLink(AI_CY, AI_CY)} stroke="#a8691f" strokeWidth={1.5} style={{ animationDelay: `${T.aiLeafLink}s, ${T.aiLeafLink}s` }} />

          {flowPaths.map((d, i) => (
            <circle key={d} className="nr-smil" r={3} fill="#722F37" opacity={0}>
              <animateMotion path={d} dur="2.6s" begin={`${T.flow + i * 0.6}s`} repeatCount="indefinite" />
              <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.15;0.8;1" dur="2.6s" begin={`${T.flow + i * 0.6}s`} repeatCount="indefinite" />
            </circle>
          ))}

          <g className="nr-node" style={{ animationDelay: `${T.root}s` }}>
            <rect x={ROOT.x} y={ROOT.y} width={ROOT.w} height={ROOT.h} rx={10} fill="#722F37" filter="url(#nr-shadow)" />
            <text x={ROOT.x + 14} y={ROOT.y + 21} fontSize={10} fill="#E8C9C4" fontFamily={MONO}>
              1.0
            </text>
            <text x={ROOT.x + 14} y={ROOT.y + 39} fontSize={12.5} fontWeight={700} fill="#fff">
              Enterprise Data Platform
            </text>
          </g>

          {BRANCHES.map((b, bi) => (
            <g key={b.id}>
              <g className="nr-node" style={{ animationDelay: `${T.child + bi * 0.12}s` }}>
                <rect x={CHILD_X} y={b.cy - 20} width={CHILD_W} height={40} rx={8} fill="#E8DCC6" filter="url(#nr-shadow)" />
                <text x={CHILD_X + 12} y={b.cy + 4} fontSize={12}>
                  <tspan fontFamily={MONO} fontSize={10.5} fill="#7A6063">
                    {b.id}
                  </tspan>
                  <tspan dx={7} fontWeight={600} fill="#2E1A1D">
                    {b.label}
                  </tspan>
                </text>
              </g>
              {b.leaves.map(([name, ly], li) => (
                <g key={name} className="nr-node" style={{ animationDelay: `${T.leaf + bi * 0.2 + li * 0.1}s` }}>
                  <rect x={LEAF_X} y={ly - 16} width={LEAF_W} height={32} rx={7} fill="#DDE7D0" />
                  <text x={LEAF_X + 12} y={ly + 4} fontSize={11} fill="#2E1A1D">
                    {name}
                  </text>
                </g>
              ))}
            </g>
          ))}

          <g className="nr-node" style={{ animationDelay: `${T.aiChild}s` }}>
            <rect
              className="nr-ai-glow"
              x={CHILD_X - 5}
              y={AI_CY - 25}
              width={CHILD_W + 10}
              height={50}
              rx={12}
              fill="#F5E3C8"
              style={{ animationDelay: `${T.aiChild + 0.6}s` }}
            />
            <rect x={CHILD_X} y={AI_CY - 20} width={CHILD_W} height={40} rx={8} fill="#FBF1E1" stroke="#a8691f" strokeDasharray="4 3" />
            <text x={CHILD_X + 12} y={AI_CY + 4} fontSize={12}>
              <tspan fontFamily={MONO} fontSize={10.5} fill="#a8691f">
                1.3
              </tspan>
              <tspan dx={7} fontWeight={600} fill="#2E1A1D">
                Disaster Recovery
              </tspan>
            </text>
            <text x={CHILD_X} y={AI_CY - 28} fontSize={10} fontFamily={MONO} fontWeight={700} fill="#a8691f">
              AI suggested, awaiting approval
            </text>
          </g>
          <g className="nr-node" style={{ animationDelay: `${T.aiLeaf}s` }}>
            <rect x={LEAF_X} y={AI_CY - 16} width={LEAF_W} height={32} rx={7} fill="#FBF1E1" stroke="#a8691f" strokeDasharray="4 3" />
            <text x={LEAF_X + 12} y={AI_CY + 4} fontSize={11} fill="#2E1A1D">
              DR runbook & failover
            </text>
          </g>
        </svg>
      </div>

      <Chip delay={4.0} floatDelay="-2s" style={{ top: -18, right: 8 }} dot="#5B8C4A">
        OR-Tools: optimal schedule in 0.4s
      </Chip>
      <Chip delay={4.3} floatDelay="-4s" style={{ bottom: -22, left: 24 }} dot="#722F37" className="nr-chip-hide">
        RACI linked to 6 work packages
      </Chip>
    </div>
  )
}

function Chip({
  delay,
  floatDelay,
  style,
  dot,
  className,
  children,
}: {
  delay: number
  floatDelay: string
  style: CSSProperties
  dot: string
  className?: string
  children: ReactNode
}) {
  return (
    <div aria-hidden="true" className={`nr-chip ${className ?? ''}`} style={{ position: 'absolute', animationDelay: `${delay}s`, ...style }}>
      <div
        className="nr-chip-inner flex items-center gap-2"
        style={{
          animationDelay: floatDelay,
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(6px)',
          border: '1px solid #E8DCC6',
          borderRadius: 999,
          padding: '6px 12px',
          fontSize: 11.5,
          color: '#4A2B2F',
          whiteSpace: 'nowrap',
          boxShadow: '0 8px 20px -14px rgba(114,47,55,.5)',
        }}
      >
        <span className="nr-live" style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />
        {children}
      </div>
    </div>
  )
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#722F37', marginBottom: 8 }}>{eyebrow}</div>
      <h2 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>{title}</h2>
    </div>
  )
}
