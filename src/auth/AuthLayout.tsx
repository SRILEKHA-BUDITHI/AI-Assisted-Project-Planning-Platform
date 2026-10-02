import { useEffect, type ReactNode } from 'react'

const FEATURES = [
  'AI extracts scope from briefs, transcripts and RFPs',
  'Validated work breakdown structures in minutes',
  'Optimized schedules and resource allocation',
]

export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-[4px] bg-[#555] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.43 }}
    >
      AI
    </div>
  )
}

export default function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    document.title = `${title} · ProjectAI`
  }, [title])

  return (
    <div className="flex min-h-screen bg-[#f7f7f7]">
      {/* Brand panel */}
      <aside className="relative hidden w-[420px] shrink-0 flex-col justify-between overflow-hidden bg-[#2d2d2d] px-12 py-12 text-white lg:flex">
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
          <div className="mb-12 flex items-center gap-2">
            <BrandMark />
            <span className="text-base font-semibold">ProjectAI</span>
          </div>
          <h2 className="mb-4 text-[28px] font-bold leading-[1.3]">AI-Assisted Project Planning Platform</h2>
          <p className="text-sm leading-[1.7] text-[#a3a3a3]">
            Plan projects intelligently. AI extracts scope, builds WBS structures, and optimizes resource allocation
            automatically.
          </p>
          <ul className="mt-10 space-y-3.5">
            {FEATURES.map((feature) => (
              <li key={feature} className="flex items-start gap-3 text-[13px] leading-5 text-[#d4d4d4]">
                <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#444]">
                  <svg aria-hidden="true" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative text-xs text-[#777]">© {new Date().getFullYear()} ProjectAI Inc.</div>
      </aside>

      {/* Content */}
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-[380px]">
          <div className="mb-10 flex items-center gap-2 lg:hidden">
            <BrandMark size={28} />
            <span className="text-[15px] font-semibold">ProjectAI</span>
          </div>
          <div className="mb-8">
            <h1 className="mb-1.5 text-[22px] font-bold text-[#1a1a1a]">{title}</h1>
            {subtitle && <div className="text-sm leading-6 text-[#737373]">{subtitle}</div>}
          </div>
          {children}
          {footer && <div className="mt-8 text-center text-[13px] text-[#737373]">{footer}</div>}
        </div>
      </main>
    </div>
  )
}

export const linkClass =
  'font-medium text-[#2d2d2d] underline decoration-[#bdbdbd] underline-offset-2 hover:decoration-[#2d2d2d] rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d2d2d]'
