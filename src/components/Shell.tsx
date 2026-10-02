import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useLocation, useMatch, useNavigate } from 'react-router'
import { useAuth } from '@/auth/useAuth'
import { useOrg } from '@/org/useOrg'
import { useProject } from '@/lib/queries'
import { FLOW_STEPS, stepPath } from '@/lib/steps'
import { initials } from '@/lib/format'
import AIChat from './AIChat'
import { BrandMark, BrandName } from './Brand'
import { Alert, Spinner } from './ui'

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

const navItemBase =
  'mb-0.5 flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary'

function navItemClass(active: boolean): string {
  return cx(navItemBase, active ? 'bg-white font-semibold text-primary shadow-sm' : 'text-secondary-foreground hover:bg-white/60')
}

function StepBadge({ number, active, disabled }: { number?: number; active: boolean; disabled?: boolean }) {
  if (number === undefined) return <span aria-hidden="true" className="inline-block h-[18px] w-[18px] shrink-0" />
  return (
    <span
      aria-hidden="true"
      className={cx(
        'mono flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[10px]',
        active ? 'bg-secondary text-primary' : 'bg-[#dcd8f3] text-primary',
        disabled && 'opacity-60',
      )}
    >
      {number}
    </span>
  )
}

/** `/projects/:projectId/...` — but not the static `/projects/new` route. */
function useCurrentProjectId(): string | undefined {
  const match = useMatch('/projects/:projectId/*')
  const id = match?.params.projectId
  return id && id !== 'new' ? id : undefined
}

/** Name of the screen in the current URL, used as the assistant's context. */
function useScreenLabel(): string {
  const { pathname } = useLocation()
  if (pathname === '/') return 'Dashboard'
  if (pathname === '/projects/new') return 'Create Project'
  const segment = /^\/projects\/[^/]+\/([^/]+)/.exec(pathname)?.[1]
  return FLOW_STEPS.find((s) => s.segment === segment)?.label ?? 'Dashboard'
}

/* ─────────────────────────── Assistant panel state ─────────────────────────── */

const CHAT_OPEN_KEY = 'nirnain.assistant.open'
const WIDE_SCREEN_QUERY = '(min-width: 1100px)'

function initialChatOpen(): boolean {
  try {
    const stored = window.localStorage.getItem(CHAT_OPEN_KEY)
    if (stored === 'true' || stored === 'false') return stored === 'true'
  } catch {
    // Storage can be unavailable (private mode, blocked cookies); fall back to the screen size.
  }
  return window.matchMedia(WIDE_SCREEN_QUERY).matches
}

function persistChatOpen(open: boolean) {
  try {
    window.localStorage.setItem(CHAT_OPEN_KEY, String(open))
  } catch {
    // Not persisting is harmless; the panel just uses the default next time.
  }
}

/* ─────────────────────────── Shell ─────────────────────────── */

export default function Shell({ children }: { children: ReactNode }) {
  const projectId = useCurrentProjectId()
  const project = useProject(projectId)
  const hintId = useId()
  const { pathname } = useLocation()
  const screenLabel = useScreenLabel()
  const identity = useAccountIdentity()
  const mainRef = useRef<HTMLElement>(null)
  const openChatRef = useRef<HTMLButtonElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)
  const [chatOpen, setChatOpen] = useState(initialChatOpen)
  const focusAfterToggle = useRef(false)

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 })
  }, [pathname])

  useEffect(() => {
    if (!focusAfterToggle.current) return
    focusAfterToggle.current = false
    if (chatOpen) chatInputRef.current?.focus()
    else openChatRef.current?.focus()
  }, [chatOpen])

  function toggleChat(open: boolean) {
    focusAfterToggle.current = true
    setChatOpen(open)
    persistChatOpen(open)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <aside className="flex w-[232px] shrink-0 flex-col border-r border-border bg-[#ebe8fa] text-secondary-foreground">
        {/* Logo */}
        <div className="border-b border-border px-5 py-5">
          <Link to="/" className="flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
            <BrandMark />
            <div>
              <BrandName className="block text-[15px] leading-[1.2] text-foreground" />
              <div className="text-[10px] leading-[1.2] text-muted-foreground">Planning Platform</div>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 py-4">
          <div className="mb-1.5 pl-2 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Workflow</div>
          <NavLink to="/" end className={({ isActive }) => navItemClass(isActive)}>
            {({ isActive }) => (
              <>
                <StepBadge active={isActive} />
                Dashboard
              </>
            )}
          </NavLink>

          {projectId && (
            <div className="mx-0.5 mb-1.5 mt-3 rounded-md border border-border bg-white/70 px-2.5 py-2">
              <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Current project</div>
              {project.data ? (
                <div className="mt-0.5 truncate text-xs font-medium text-foreground" title={project.data.name}>
                  <span className="mono mr-1.5 text-muted-foreground">{project.data.code}</span>
                  {project.data.name}
                </div>
              ) : project.isError ? (
                <div className="mt-0.5 text-xs text-[#c4506a]">Project unavailable</div>
              ) : (
                <div className="mt-1.5 h-3 w-28 animate-pulse rounded bg-[#dcd8f3]" />
              )}
            </div>
          )}

          <div className={projectId ? 'mt-1' : 'mt-0'}>
            {FLOW_STEPS.map((step, index) => {
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
                    className={cx(navItemBase, 'cursor-not-allowed text-[#8c89a8]')}
                  >
                    <StepBadge number={index + 1} active={false} disabled />
                    {step.label}
                  </span>
                )
              }
              return (
                <NavLink key={step.key} to={stepPath(step.key, projectId)} className={({ isActive }) => navItemClass(isActive)}>
                  {({ isActive }) => (
                    <>
                      <StepBadge number={index + 1} active={isActive} />
                      {step.label}
                    </>
                  )}
                </NavLink>
              )
            })}
            {!projectId && (
              <p id={hintId} className="mx-2.5 mt-2 text-[11px] leading-4 text-muted-foreground">
                Open or create a project first to unlock the planning steps.
              </p>
            )}
          </div>
        </nav>

        <UserMenu identity={identity} />
      </aside>

      <main ref={mainRef} className="min-w-0 flex-1 overflow-y-auto">
        <NoticeBanner />
        {children}
      </main>

      {chatOpen ? (
        <AIChat
          contextLabel={screenLabel}
          firstName={identity.firstName}
          onClose={() => toggleChat(false)}
          inputRef={chatInputRef}
        />
      ) : (
        <button
          ref={openChatRef}
          type="button"
          onClick={() => toggleChat(true)}
          className="fixed bottom-6 right-6 z-20 flex items-center gap-2 rounded-full bg-primary px-[18px] py-3 text-[13px] font-semibold text-primary-foreground shadow-lg transition hover:bg-[#3d3c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary cursor-pointer"
        >
          <span aria-hidden="true">✦</span> Ask NirnAIn AI
        </button>
      )}
    </div>
  )
}

/* ─────────────────────────── Account identity ─────────────────────────── */

function metadataString(metadata: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = metadata?.[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

const ROLE_LABELS: Record<string, string> = { owner: 'Owner', admin: 'Admin', member: 'Member', viewer: 'Viewer' }

interface AccountIdentity {
  name: string
  firstName: string | null
  email: string
  avatarUrl: string | null
  subtitle: string
}

function useAccountIdentity(): AccountIdentity {
  const { user } = useAuth()
  const { me, org } = useOrg()
  const metadata = user?.user_metadata as Record<string, unknown> | undefined
  const email = me.email || user?.email || ''
  const fullName = me.fullName?.trim() || metadataString(metadata, 'full_name', 'name')
  return {
    name: fullName || email.split('@')[0] || 'Account',
    firstName: fullName?.split(/\s+/)[0] ?? null,
    email,
    avatarUrl: me.avatarUrl || metadataString(metadata, 'avatar_url', 'picture'),
    subtitle: me.jobTitle?.trim() || ROLE_LABELS[org.role] || org.role,
  }
}

/* ─────────────────────────── User menu ─────────────────────────── */

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
      className="flex shrink-0 items-center justify-center rounded-full bg-[#c9e8dc] font-semibold text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials(name)}
    </div>
  )
}

function UserMenu({ identity }: { identity: AccountIdentity }) {
  const { signOut } = useAuth()
  const { org } = useOrg()
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstItemRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const { name, email, avatarUrl, subtitle } = identity

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
      className="relative border-t border-border px-3 py-3"
      onBlur={(event) => {
        if (open && !containerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false)
      }}
    >
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Account"
          className="absolute bottom-full left-3 right-3 mb-2 overflow-hidden rounded-md border border-border bg-white text-foreground shadow-[0_12px_32px_-8px_rgba(35,34,58,0.35)]"
        >
          <div className="border-b border-muted px-3.5 py-3">
            <div className="truncate text-[13px] font-semibold">{name}</div>
            <div className="truncate text-xs text-muted-foreground">{email}</div>
          </div>
          <div className="border-b border-muted px-3.5 py-2.5">
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">Organization</div>
            <div className="mt-0.5 flex items-center justify-between gap-2 text-xs">
              <span className="truncate font-medium">{org.name}</span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-px text-[10px] text-secondary-foreground">
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
            className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left text-[13px] text-foreground hover:bg-background focus-visible:bg-muted focus-visible:outline-none disabled:text-[#9b98b5] cursor-pointer"
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
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-white/60 focus-visible:outline-2 focus-visible:outline-primary cursor-pointer',
          open && 'bg-white/60',
        )}
      >
        <Avatar name={name} url={avatarUrl} size={30} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">{name}</div>
          <div className="truncate text-[10px] text-muted-foreground">{subtitle}</div>
        </div>
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b6987" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
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
