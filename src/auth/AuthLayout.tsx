import { useEffect, type ReactNode } from 'react'
import { APP_NAME, BrandMark, BrandName } from '@/components/Brand'

const FEATURES = [
  'AI extracts scope from briefs, transcripts and RFPs',
  'Validated work breakdown structures in minutes',
  'Optimized schedules and resource allocation',
]

const DEFAULT_PANEL = {
  heading: 'AI-Assisted Project Planning Platform',
  text: 'Plan projects intelligently. AI extracts scope, builds WBS structures, and optimizes resource allocation automatically.',
}

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
  panel = DEFAULT_PANEL,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  /** Copy for the brand panel shown on wide screens. */
  panel?: { heading: string; text: string }
}) {
  useEffect(() => {
    document.title = `${title} · ${APP_NAME}`
  }, [title])

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel */}
      <aside className="relative hidden w-[420px] shrink-0 flex-col justify-between overflow-hidden bg-primary px-12 py-12 text-primary-foreground lg:flex">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '32px 32px',
            maskImage: 'linear-gradient(to bottom, black, transparent 75%)',
          }}
        />
        <div className="relative">
          <div className="mb-12 flex items-center gap-2.5">
            <BrandMark inverted />
            <BrandName inverted className="text-base" />
          </div>
          <h2 className="mb-4 text-[28px] font-bold leading-[1.3]">{panel.heading}</h2>
          <p className="text-sm leading-[1.7] text-[#d9d6ee]">{panel.text}</p>
          <ul className="mt-10 space-y-3.5">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-[13px] leading-5 text-[#e4e2f7]">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#dcf3e8]">
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3f8a6a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-[#c9c6ee]">
          © {new Date().getFullYear()} {APP_NAME} Inc.
        </div>
      </aside>

      {/* Content */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-2 lg:hidden">
            <BrandMark size={28} />
            <BrandName className="text-[15px]" />
          </div>
          <div className="mb-8">
            <h1 className="mb-1.5 text-[22px] font-bold text-foreground">{title}</h1>
            {subtitle && <div className="text-sm leading-6 text-muted-foreground">{subtitle}</div>}
          </div>
          {children}
          {footer && <div className="mt-8 text-center text-[13px] text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export const linkClass =
  'font-medium text-primary underline decoration-[#b5b1dc] underline-offset-2 hover:decoration-primary rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
