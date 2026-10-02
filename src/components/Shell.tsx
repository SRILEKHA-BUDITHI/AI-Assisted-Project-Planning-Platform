import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { useOrg } from '@/org/useOrg'
import { useProject } from '@/lib/queries'
import { FLOW_STEPS, stepPath } from '@/lib/steps'
import { initials } from '@/lib/format'
import { Alert, Spinner } from './ui'

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

const navItemBase =
  'flex w-full items-center gap-2 px-5 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white/70'

function navItemClass(active: boolean): string {
  return cx(navItemBase, active ? 'bg-[#444] font-semibold text-white' : 'text-[#bbb] hover:bg-[#333] hover:text-white')
}

/** `/projects/:projectId/...` — but not the static `/projects/new` route. */
function useCurrentProjectId(): string | undefined {
  const match = useMatch('/projects/:projectId/*')
  const id = match?.params.projectId
  return id && id !== 'new' ? id : undefined
}

export default function Shell({ children }: { children: ReactNode }) {
  const projectId = useCurrentProjectId()
  const project = useProject(projectId)
  const hintId = useId()

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--background)]">
      <aside className="flex w-[220px] shrink-0 flex-col border-r border-[#111] bg-[var(--primary)] text-[var(--primary-foreground)]">
        {/* Logo */}
        <div className="border-b border-[#444] px-5 py-5">
          <Link to="/" className="flex items-center gap-2 rounded-[3px] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70">
            <div aria-hidden="true" className="flex h-7 w-7 items-center justify-center rounded-[4px] bg-[#555] text-[13px] font-bold">
              AI
            </div>
            <div>
              <div className="text-[13px] font-semibold leading-[1.2]">ProjectAI</div>
              <div className="text-[10px] leading-[1.2] text-[#999]">Planning Platform</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav aria-label="Main" className="flex-1 overflow-y-auto py-4">
          <div className="mb-1.5 pl-5 text-[10px] uppercase tracking-[0.08em] text-[#777]">Navigation</div>
          <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)}>
            Dashboard
          </NavLink>

          {projectId && (
            <div className="mx-5 mb-1 mt-4 rounded-[4px] border border-[#444] bg-[#262626] px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-[#777]">Current project</div>
              {project.data ? (
                <div className="mt-0.5 truncate text-xs font-medium text-white" title={project.data.name}>
                  <span className="mono mr-1.5 text-[#999]">{project.data.code}</span>
                  {project.data.name}
                </div>
              ) : project.isError ? (
                <div className="mt-0.5 text-xs text-[#d08a8a]">Project unavailable</div>
              ) : (
                <div className="mt-1.5 h-3 w-28 animate-pulse rounded bg-[#3a3a3a]" />
              )}
            </div>
          )}

          <div className={cx(projectId ? 'mt-1' : 'mt-4')}>
            {FLOW_STEPS.map((step, index) => {
              const number = (
                <span aria-hidden="true" className="mono ml-1 text-[10px] text-[#666]">
                  {index + 1}.
                </span>
              )
              const enabled = step.segment === null || Boolean(projectId)
              if (!enabled) {
                return (
                  <span
                    key={step.key}
                    role="link"
                    aria-disabled="true"
                    aria-describedby={hintId}
                    tabIndex={0}
                    title="Open or create a project first"
                    className={cx(navItemBase, 'cursor-not-allowed text-[#6f6f6f]')}
                  >
                    {number}
                    {step.label}
                  </span>
                )
              }
              return (
                <NavLink key={step.key} to={stepPath(step.key, projectId)} className={({ isActive }) => navItemClass(isActive)}>
                  {number}
                  {step.label}
                </NavLink>
              )
            })}
            {!projectId && (
              <p id={hintId} className="mx-5 mt-2 text-[11px] leading-4 text-[#7a7a7a]">
                Open or create a project first to unlock the planning steps.
              </p>
            )}
          </div>
        </nav>

        <UserMenu />
      </aside>

      <main className="flex-1 overflow-y-auto">
        <NoticeBanner />
        {children}
      </main>
    </div>
  )
}

/* ─────────────────────────── User menu ─────────────────────────── */

function metadataString(metadata: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }

function Avatar({ name, url, size = 28 }: { name: string; url: string | null; size?: number }) {
  const [failed, setFailed] = useState(false)
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    )
  }
  return (
    <div
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-full bg-[#555] font-medium text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initials(name)}
    </div>
  )
}

function UserMenu() {
  const { user, signOut } = useAuth()
  const { me, org } = useOrg()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const email = me.email || user?.email || ''
  const name = me.fullName?.trim() || metadataString(metadata, 'full_name', 'name') || email.split('@')[0] || 'Account'
  const avatarUrl = me.avatarUrl || metadataString(metadata, 'avatar_url', 'picture')
  const subtitle = me.jobTitle?.trim() || ROLE_LABELS[org.role] || org.role

  useEffect(() => {
    if (!open) return
    firstItemRef.current?.focus()
    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false)
        buttonRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative border-t border-[#444] px-3 py-3"
      onBlur={(event) => {
        if (open && !containerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-md border border-[#e3e3e3] bg-white text-[#1a1a1a] shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]"
        >
          <div className="border-b border-[#f0f0f0] px-3.5 py-3">
            <div className="truncate text-[13px] font-semibold">{name}</div>
            <div className="truncate text-xs text-[#737373]">{email}</div>
          </div>
          <div className="border-b border-[#f0f0f0] px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-[#999]">Organization</div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">{org.name}</span>
              <span className="shrink-0 rounded-full bg-[#f0f0f0] px-2 py-px text-[10px] text-[#555]">
                {ROLE_LABELS[org.role] ?? org.role}
              </span>
            </div>
          </div>
          <button
            ref={firstItemRef}
            type="button"
            role="menuitem"
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-[#1a1a1a] hover:bg-[#f7f7f7] focus-visible:bg-[#f0f0f0] focus-visible:outline-none disabled:text-[#999] cursor-pointer"
          >
            {signingOut ? (
              <Spinner size={14} />
            ) : (
              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3" />
              </svg>
            )}
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}

      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
        className={cx(
          'flex w-full items-center gap-2 rounded-[4px] px-2 py-1.5 text-left transition-colors hover:bg-[#383838] focus-visible:outline-2 focus-visible:outline-white/70 cursor-pointer',
          open && 'bg-[#383838]',
        )}
      >
        <Avatar name={name} url={avatarUrl} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium">{name}</div>
          <div className="truncate text-[10px] text-[#888]">{subtitle}</div>
        </div>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M7 15l5-5 5 5" />
        </svg>
        <span className="sr-only">Open account menu</span>
      </button>
    </div>
  )
}

/* ─────────────────────────── Flash notice ─────────────────────────── */

function noticeFromState(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'notice' in state) {
    const notice = (state as { notice: unknown }).notice
    return typeof notice === 'string' ? notice : null
  }
  return null
}

/** Shows a one-off success message passed via `navigate(path, { state: { notice } })`. */
function NoticeBanner() {
  const location = useLocation()
  const navigate = useNavigate()
  const notice = noticeFromState(location.state)

  useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => {
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    }, 6000)
    return () => window.clearTimeout(timer)
  }, [notice, location.pathname, location.search, navigate])

  return (
    <div aria-live="polite" aria-atomic="true">
      {notice && (
        <div className="px-9 pt-6">
          <Alert
            tone="success"
            onDismiss={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })}
          >
            {notice}
          </Alert>
        </div>
      )}
    </div>
  )
}
