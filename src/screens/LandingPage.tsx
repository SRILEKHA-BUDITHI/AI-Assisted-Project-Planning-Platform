import { useEffect } from 'react'
import { Link } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { APP_NAME, BrandMark, BrandName } from '@/components/Brand'

const FEATURES = [
  { tag: 'AI', title: 'AI Project Intake', text: 'Drop in meeting transcripts, PDFs, Word files and audio. AI extracts goals, scope, stakeholders and assumptions for your review.', bg: 'bg-secondary' },
  { tag: 'WBS', title: 'WBS / PBS / OBS / RACI', text: 'Generate linked work, product and organizational breakdown structures, with responsibility matrices built from the same model.', bg: 'bg-accent' },
  { tag: 'RSK', title: 'Risk Management', text: 'Surface risks from your scope and constraints, rate impact and likelihood, and tie mitigations to the work packages they affect.', bg: 'bg-[#fde8ee]' },
  { tag: 'OPT', title: 'Optimization Engine', text: 'Solve resource allocation and scheduling against budget, deadline, capacity and skill constraints with OR-Tools, and compare feasible scenarios.', bg: 'bg-[#fdeedd]' },
  { tag: 'TRC', title: 'Traceability', text: 'Follow every task back to the requirement, meeting or document it came from, and see what changes when a source changes.', bg: 'bg-[#e1e8fb]' },
  { tag: 'GOV', title: 'AI Governance', text: 'AI proposes, people decide. Every AI suggestion is logged, reviewable and requires explicit human approval before it enters the plan.', bg: 'bg-[#ebe8fa]' },
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

const HUMAN_APPROVAL_STEP = 5

const SECTIONS = [
  ['About', 'about'],
  ['Features', 'features'],
  ['How It Works', 'how'],
] as const

const primaryBtn =
  'inline-flex items-center justify-center rounded-[4px] bg-primary font-semibold text-primary-foreground transition hover:bg-[#3d3c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const ghostBtn =
  'inline-flex items-center justify-center rounded-[4px] border border-border bg-white font-medium text-primary transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

/** Public marketing page at `/`. Signed-in visitors get a shortcut to their dashboard. */
export default function LandingPage() {
  const { session } = useAuth()
  const signedIn = Boolean(session)

  useEffect(() => {
    document.title = `${APP_NAME} — AI Project Planning`
  }, [])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-[rgba(246,245,253,0.92)] backdrop-blur">
        <div className="mx-auto flex max-w-[1120px] items-center justify-between gap-4 px-4 py-3.5 sm:px-8">
          <Link to="/" className="flex items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <BrandMark />
            <BrandName className="text-base" />
          </Link>
          <nav aria-label="Main" className="flex items-center gap-3 text-sm sm:gap-6">
            {SECTIONS.map(([label, id]) => (
              <button
                key={id}
                type="button"
                onClick={() => scrollToSection(id)}
                className="hidden cursor-pointer text-secondary-foreground transition-colors hover:text-primary md:block"
              >
                {label}
              </button>
            ))}
            {signedIn ? (
              <Link to="/dashboard" className={`${primaryBtn} px-5 py-2 text-sm`}>
                Go to Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className={`${ghostBtn} px-4 py-2 text-sm`}>
                  Sign In
                </Link>
                <Link to="/signup" className={`${primaryBtn} px-5 py-2 text-sm`}>
                  Get Started
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-[1120px] px-4 pb-16 pt-16 sm:px-8 sm:pb-[72px] sm:pt-[88px]">
          <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div>
              <span className="mb-5 inline-block rounded-full bg-secondary px-3 py-1 text-xs font-semibold text-primary">
                AI-Assisted Project Planning
              </span>
              <h1 className="m-0 text-4xl font-bold leading-[1.1] tracking-[-0.025em] sm:text-5xl">
                Turn Project Ideas Into Structured, Optimized Plans
              </h1>
              <p className="mb-8 mt-5 max-w-[520px] text-[17px] leading-[1.65] text-[#5a5878]">
                {APP_NAME} uses AI to transform meetings, documents and requirements into structured project plans, then
                applies optimization for resource allocation, scheduling and decision support.
              </p>
              <div className="flex flex-wrap gap-3">
                {signedIn ? (
                  <Link to="/dashboard" className={`${primaryBtn} px-7 py-[13px] text-[15px]`}>
                    Go to Dashboard
                  </Link>
                ) : (
                  <>
                    <Link to="/signup" className={`${primaryBtn} px-7 py-[13px] text-[15px]`}>
                      Get Started
                    </Link>
                    <Link to="/login" className={`${ghostBtn} px-7 py-[13px] text-[15px]`}>
                      Sign In
                    </Link>
                  </>
                )}
              </div>
            </div>

            <div aria-hidden="true" className="rounded-xl border border-border bg-white p-5 shadow-[0_12px_32px_-16px_#4b4a9e55]">
              <div className="mono mb-2.5 text-[11px] text-muted-foreground">1.0 Enterprise Data Platform</div>
              {[
                ['1.1 Data Ingestion Layer', ['Salesforce connector', 'SAP integration']],
                ['1.2 Data Warehouse & ETL', ['Schema design', 'ETL pipelines']],
              ].map(([name, children]) => (
                <div key={name as string} className="mb-2.5 ml-3">
                  <div className="rounded-md bg-secondary px-2.5 py-[7px] text-xs font-semibold">{name as string}</div>
                  {(children as string[]).map((child) => (
                    <div key={child} className="ml-5 mt-1.5 rounded-md bg-accent px-2.5 py-1.5 text-xs">
                      {child}
                    </div>
                  ))}
                </div>
              ))}
              <div className="mt-3.5 flex items-center gap-2 rounded-md bg-[#fdeedd] px-2.5 py-2 text-xs">
                <span className="font-bold text-[#a8691f]">AI</span> Missing: disaster recovery work package
              </div>
            </div>
          </div>
        </section>

        <section id="about" className="scroll-mt-16 border-y border-secondary bg-white">
          <div className="mx-auto grid max-w-[1120px] gap-6 px-4 py-16 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] lg:gap-12">
            <h2 className="m-0 text-[30px] font-bold leading-[1.2] tracking-[-0.02em]">Planning shouldn't start from a blank page.</h2>
            <p className="m-0 text-base leading-[1.7] text-[#5a5878]">
              Project knowledge is scattered across calls, documents and inboxes. {APP_NAME} gathers it, builds a structured
              and traceable project model, and uses mathematical optimization to test what is actually feasible. AI does the
              heavy lifting, and your team keeps the final say.
            </p>
          </div>
        </section>

        <section id="features" className="mx-auto max-w-[1120px] scroll-mt-16 px-4 py-20 sm:px-8">
          <SectionHead eyebrow="Features" title="Everything between idea and approved plan" />
          <div className="grid gap-5 [grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))]">
            {FEATURES.map((feature) => (
              <div key={feature.title} className="rounded-[10px] border border-secondary bg-white p-6 transition-transform hover:-translate-y-0.5">
                <div className={`mono mb-4 flex h-10 w-10 items-center justify-center rounded-lg text-[11px] font-semibold text-secondary-foreground ${feature.bg}`}>
                  {feature.tag}
                </div>
                <h3 className="mb-2 mt-0 text-base font-semibold">{feature.title}</h3>
                <p className="m-0 text-sm leading-[1.6] text-[#5a5878]">{feature.text}</p>
              </div>
            ))}
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-y border-border bg-[#ebe8fa]">
          <div className="mx-auto max-w-[1120px] px-4 py-20 sm:px-8">
            <SectionHead eyebrow="How It Works" title="From raw input to monitored execution" />
            <ol className="m-0 grid list-none gap-4 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr))]">
              {STEPS.map(([title, description], i) => (
                <li key={title} className="rounded-[10px] border border-border bg-white px-5 py-[18px]">
                  <span
                    className={`mono mb-3 flex h-[26px] w-[26px] items-center justify-center rounded-full text-xs ${
                      i === HUMAN_APPROVAL_STEP ? 'bg-accent text-foreground' : 'bg-primary text-primary-foreground'
                    }`}
                  >
                    {i + 1}
                  </span>
                  <div className="mb-1 text-sm font-semibold">{title}</div>
                  <div className="text-[13px] leading-normal text-[#5a5878]">{description}</div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mx-auto max-w-[1120px] px-4 py-20 sm:px-8">
          <div className="rounded-2xl bg-primary px-6 py-14 text-center text-primary-foreground sm:px-10">
            <h2 className="m-0 mb-2.5 text-[32px] font-bold tracking-[-0.02em]">Ready to structure your next project?</h2>
            <p className="m-0 mb-7 text-[15px] text-border">Create a workspace and turn your first meeting notes into a plan.</p>
            <div className="flex flex-wrap justify-center gap-3">
              {signedIn ? (
                <Link to="/dashboard" className="inline-flex items-center justify-center rounded-[4px] bg-white px-7 py-[13px] text-[15px] font-semibold text-primary transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                  Go to Dashboard
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="inline-flex items-center justify-center rounded-[4px] bg-white px-7 py-[13px] text-[15px] font-semibold text-primary transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                    Create Account
                  </Link>
                  <Link to="/login" className="inline-flex items-center justify-center rounded-[4px] border border-white/55 px-7 py-[13px] text-[15px] text-white transition hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
                    Sign In
                  </Link>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-border px-8 py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {APP_NAME} Inc.
      </footer>
    </div>
  )
}

function SectionHead({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-9">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-primary">{eyebrow}</div>
      <h2 className="m-0 text-[30px] font-bold tracking-[-0.02em]">{title}</h2>
    </div>
  )
}
