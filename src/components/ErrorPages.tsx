import { Component, useEffect, type ErrorInfo, type ReactNode } from 'react'
import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { APP_NAME } from './Brand'

const primaryLinkClass =
  'inline-flex items-center justify-center rounded-[4px] bg-primary px-5 py-[9px] text-[13px] font-semibold text-white hover:bg-[#3d3c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary'
const secondaryButtonClass =
  'inline-flex items-center justify-center rounded-[4px] border border-border bg-white px-5 py-[9px] text-[13px] font-medium text-primary hover:bg-[#faf9fe] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer'

/** Presentational full-page message. Uses plain anchors when rendered outside the router. */
export function MessagePage({
  code,
  title,
  message,
  actions,
  inline = false,
}: {
  code?: string
  title: string
  message: ReactNode
  actions?: ReactNode
  inline?: boolean
}) {
  return (
    <div className={inline ? 'flex min-h-[60vh] items-center justify-center px-6 py-16' : 'flex min-h-screen items-center justify-center bg-background px-6 py-16'}>
      <div className="max-w-md text-center">
        {code && <div className="mono mb-3 text-xs tracking-[0.2em] text-[#7d7a99]">{code}</div>}
        <h1 className="text-[22px] font-bold text-foreground">{title}</h1>
        <div className="mt-2 text-sm leading-6 text-muted-foreground">{message}</div>
        {actions && <div className="mt-7 flex justify-center gap-3">{actions}</div>}
      </div>
    </div>
  )
}

export function NotFound({ inline = false }: { inline?: boolean }) {
  useEffect(() => {
    document.title = `Page not found · ${APP_NAME}`
  }, [])
  return (
    <MessagePage
      inline={inline}
      code="404"
      title="We can't find that page"
      message="The link may be broken, or the page may have moved. Check the address or head back to your dashboard."
      actions={
        <Link to="/" className={primaryLinkClass}>
          Go to dashboard
        </Link>
      }
    />
  )
}

/** Router `errorElement`: renders 404s and unexpected render/loader errors. */
export function RouteError({ inline = false }: { inline?: boolean }) {
  const error = useRouteError()
  useEffect(() => {
    if (!(isRouteErrorResponse(error) && error.status === 404)) console.error(error)
  }, [error])

  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound inline={inline} />
  return <CrashPage inline={inline} />
}

function CrashPage({ inline }: { inline?: boolean }) {
  return (
    <MessagePage
      inline={inline}
      title="Something went wrong"
      message="An unexpected error interrupted this page. Reloading usually fixes it — if it keeps happening, please contact support."
      actions={
        <>
          <button type="button" className={secondaryButtonClass} onClick={() => window.location.reload()}>
            Reload page
          </button>
          <a href="/" className={primaryLinkClass}>
            Go to dashboard
          </a>
        </>
      }
    />
  )
}

/** Last-resort boundary around providers that live outside the router. */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled application error', error, info.componentStack)
  }

  render(): ReactNode {
    return this.state.hasError ? <CrashPage /> : this.props.children
  }
}

/** Shown instead of the app when required build-time env vars are missing. */
export function ConfigErrorPage({ problems }: { problems: { name: string; message: string }[] }) {
  return (
    <MessagePage
      title={`${APP_NAME} isn't configured`}
      message={
        <>
          <p>This build is missing required configuration. Set the following variables and rebuild:</p>
          <ul className="mt-4 space-y-1.5 rounded-md border border-[#e4e2f7] bg-white px-4 py-3 text-left">
            {problems.map((p) => (
              <li key={p.name} className="text-[13px]">
                <code className="mono font-medium text-foreground">{p.name}</code> <span>{p.message}</span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-[#7d7a99]">See .env.example in the repository for the full list.</p>
        </>
      }
    />
  )
}
