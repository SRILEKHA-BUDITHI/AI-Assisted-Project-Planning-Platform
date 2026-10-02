import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router'
import { useOrg } from '@/org/useOrg'
import { useAtRiskProjects, useDashboard, useNotifications, useProjects } from '@/lib/queries'
import { errorMessage } from '@/lib/api'
import { formatDate, formatDateTime, formatMoney, formatNumber } from '@/lib/format'
import {
  PROJECT_STATUSES,
  STATUS_LABELS,
  type AppNotification,
  type DashboardSummary,
  type NotificationLevel,
  type Project,
  type ProjectStatus,
} from '@/lib/types'
import { Button, ErrorState, Skeleton, Spinner } from '@/components/ui'

const STATUS_COLOR: Record<ProjectStatus, string> = {
  draft: '#7d7a99',
  planning: '#4455aa',
  on_track: '#3f8a6a',
  at_risk: '#a8691f',
  delayed: '#c4506a',
  completed: '#4b4a9e',
  archived: '#9b98b5',
}

const isAtRisk = (status: ProjectStatus) => status === 'at_risk' || status === 'delayed'

/** Filter text is debounced before it becomes the `q` query param. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

export default function Dashboard() {
  const { me, org } = useOrg()
  const summary = useDashboard(org.id)
  // Same unfiltered first page the projects table starts with, so React Query shares one request.
  const portfolio = useProjects(org.id, {})
  const firstName = (me.fullName ?? '').trim().split(/\s+/)[0] || null

  useEffect(() => {
    document.title = 'Dashboard · NirnAIn'
  }, [])

  const isEmpty = summary.data?.totalProjects === 0
  const activeCount = summary.data ? summary.data.totalProjects : null

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div className="flex items-center justify-between" style={{ marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Dashboard</h1>
          <div style={{ fontSize: 13, color: '#6b6987', marginTop: 2, minHeight: 20 }}>
            {firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
            {activeCount !== null && !isEmpty && ` — ${formatNumber(activeCount)} ${activeCount === 1 ? 'project' : 'projects'} in ${org.name}`}
          </div>
        </div>
        {!isEmpty && <CreateProjectLink />}
      </div>

      {summary.isError ? (
        <div style={cardStyle}>
          <ErrorState
            title="We couldn't load your dashboard"
            message={errorMessage(summary.error)}
            onRetry={() => summary.refetch()}
            retrying={summary.isFetching}
          />
        </div>
      ) : isEmpty ? (
        <EmptyState orgName={org.name} />
      ) : (
        <>
          <KpiRow summary={summary.data} projects={portfolio.data?.pages[0]?.items} />
          <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) 300px', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
              <ProjectsTable orgId={org.id} />
              <DeliveryHealthCard query={portfolio} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <NotificationsCard />
              <AiFindingsCard />
              <AtRiskCard orgId={org.id} />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function CreateProjectLink({ large }: { large?: boolean }) {
  return (
    <Link
      to="/projects/new"
      className="inline-flex items-center justify-center rounded-[4px] bg-primary font-semibold text-white transition-colors hover:bg-[#3d3c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      style={{ padding: large ? '11px 24px' : '9px 20px', fontSize: large ? 14 : 13 }}
    >
      {large ? 'Create your first project' : '+ Create Project'}
    </Link>
  )
}

/* ─────────────────────────── KPIs ─────────────────────────── */

const KPI_LABELS = ['Project Progress', 'Budget Status', 'Milestone Status', 'Open Risks'] as const
const AFTER_PLANNING = 'Available after planning'

function averageProgress(projects: Project[]): number {
  const total = projects.reduce((sum, p) => sum + Math.max(0, Math.min(100, p.progressPct)), 0)
  return Math.round(total / projects.length)
}

function KpiRow({ summary, projects }: { summary: DashboardSummary | undefined; projects: Project[] | undefined }) {
  const kpis =
    summary && projects
      ? [
          {
            label: KPI_LABELS[0],
            value: projects.length > 0 ? `${averageProgress(projects)}%` : '—',
            sub:
              projects.length === summary.totalProjects
                ? `Portfolio average · ${formatNumber(summary.onTrack)} on track`
                : `Average of ${formatNumber(projects.length)} most recent projects`,
          },
          {
            label: KPI_LABELS[1],
            value: formatMoney(summary.totalBudgetCents, 'USD', { compact: true }),
            sub: `Planned across ${formatNumber(summary.totalProjects)} ${summary.totalProjects === 1 ? 'project' : 'projects'}`,
            title: formatMoney(summary.totalBudgetCents, 'USD'),
          },
          { label: KPI_LABELS[2], value: '—', sub: AFTER_PLANNING },
          { label: KPI_LABELS[3], value: '—', sub: AFTER_PLANNING },
        ]
      : null

  return (
    <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }} aria-busy={!kpis}>
      {kpis
        ? kpis.map((k) => (
            <div key={k.label} style={cardStyle}>
              <div style={kpiLabel}>{k.label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, marginBottom: 4 }} title={k.title}>
                {k.value}
              </div>
              <div style={{ fontSize: 12, color: '#7d7a99' }}>{k.sub}</div>
            </div>
          ))
        : KPI_LABELS.map((label) => (
            <div key={label} style={cardStyle}>
              <div style={kpiLabel}>{label}</div>
              <Skeleton style={{ height: 30, width: 72, marginBottom: 6 }} />
              <Skeleton style={{ height: 14, width: 120 }} />
            </div>
          ))}
    </div>
  )
}

/* ─────────────────────────── Delivery health ─────────────────────────── */

const HEALTH_COLUMNS = ['Project', 'Budget', 'Milestone', 'Risks', 'Utilization', 'Violations']
const HEALTH_GRID: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: '1.4fr 1fr 1.2fr 60px 1fr 80px',
  gap: 10,
  alignItems: 'center',
}

function DeliveryHealthCard({ query }: { query: ReturnType<typeof useProjects> }) {
  const rows = query.data?.pages[0]?.items ?? []

  return (
    <section style={cardStyle} aria-labelledby="health-heading">
      <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
        <h2 id="health-heading" style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          Project Delivery Health
        </h2>
        <div style={{ fontSize: 11, color: '#6b6987' }}>Current planning baseline</div>
      </div>
      {query.isError && !query.data ? (
        <ErrorState compact message={errorMessage(query.error)} onRetry={() => query.refetch()} retrying={query.isFetching} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div role="table" aria-labelledby="health-heading" style={{ minWidth: 560 }}>
            <div role="row" style={{ ...HEALTH_GRID, padding: '0 8px 7px', borderBottom: '1px solid #e4e2f7' }}>
              {HEALTH_COLUMNS.map((label) => (
                <span key={label} role="columnheader" style={{ ...thStyle, padding: 0, fontSize: 10 }}>
                  {label}
                </span>
              ))}
            </div>
            {query.isPending
              ? [0, 1, 2].map((i) => (
                  <div key={i} role="row" style={{ ...HEALTH_GRID, padding: '12px 8px', borderBottom: '1px solid #eeecf9' }}>
                    {HEALTH_COLUMNS.map((c) => (
                      <span key={c} role="cell">
                        <Skeleton style={{ height: 12, width: c === 'Project' ? 120 : 48 }} />
                      </span>
                    ))}
                  </div>
                ))
              : rows.map((p) => (
                  <div key={p.id} role="row" style={{ ...HEALTH_GRID, padding: '10px 8px', borderBottom: '1px solid #eeecf9' }}>
                    <span role="cell" style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.name}>
                        {p.name}
                      </span>
                      <StatusLabel status={p.status} />
                    </span>
                    <span role="cell">
                      <span style={{ display: 'block', fontSize: 12, fontFamily: 'DM Mono, monospace' }} title={formatMoney(p.budgetCents, p.currency)}>
                        {formatMoney(p.budgetCents, p.currency, { compact: true })}
                      </span>
                      <span style={{ fontSize: 10, color: '#7d7a99' }}>Planned budget</span>
                    </span>
                    <span role="cell">
                      <span style={{ display: 'block', fontSize: 12 }}>—</span>
                      <span style={{ fontSize: 10, color: '#7d7a99' }}>Due {formatDate(p.targetEndDate)}</span>
                    </span>
                    <span role="cell" style={healthEmpty}>—</span>
                    <span role="cell" style={healthEmpty}>—</span>
                    <span role="cell" style={healthEmpty}>—</span>
                  </div>
                ))}
          </div>
          {!query.isPending && rows.length === 0 && (
            <div style={{ padding: '24px 12px', textAlign: 'center', fontSize: 13, color: '#6b6987' }}>No projects yet.</div>
          )}
          {!query.isPending && rows.length > 0 && (
            <p style={{ margin: '10px 0 0', fontSize: 11, color: '#7d7a99' }}>
              Milestones, risks, utilization and constraint violations appear once a project has been planned and optimized.
            </p>
          )}
        </div>
      )}
    </section>
  )
}

const healthEmpty: CSSProperties = { fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#7d7a99' }

/* ─────────────────────────── AI findings ─────────────────────────── */

function AiFindingsCard() {
  return (
    <section style={cardStyle} aria-labelledby="ai-findings-heading">
      <h2 id="ai-findings-heading" style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
        Recent AI Findings
      </h2>
      <div className="flex items-start gap-2.5" style={{ fontSize: 12, color: '#6b6987', lineHeight: 1.5 }}>
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center rounded-md bg-secondary text-primary"
          style={{ width: 22, height: 22, fontSize: 11 }}
        >
          ✦
        </span>
        AI findings appear after you run intake or optimization on a project.
      </div>
    </section>
  )
}

/* ─────────────────────────── Projects table ─────────────────────────── */

const COLUMNS = ['ID', 'Project Name', 'Status', 'Progress', 'Budget', 'Due Date', 'PM']

function ProjectsTable({ orgId }: { orgId: string }) {
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const [status, setStatus] = useState<ProjectStatus | ''>('')
  const q = useDebounced(filter.trim(), 300)
  const filters = useMemo(() => ({ q: q || undefined, status: status || undefined }), [q, status])
  const projects = useProjects(orgId, filters)

  const rows = projects.data?.pages.flatMap((page) => page.items) ?? []
  const filtering = Boolean(filters.q || filters.status)
  const refreshing = projects.isFetching && !projects.isFetchingNextPage && !projects.isPending

  return (
    <section style={cardStyle} aria-labelledby="projects-heading">
      <div className="flex items-center justify-between" style={{ marginBottom: 16, gap: 12 }}>
        <div className="flex items-center gap-2">
          <h2 id="projects-heading" style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
            Projects
          </h2>
          {refreshing && <Spinner size={12} className="text-[#7d7a99]" />}
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="project-status-filter">
            Filter by status
          </label>
          <select
            id="project-status-filter"
            value={status}
            onChange={(e) => setStatus(e.target.value as ProjectStatus | '')}
            className={`${inputSm} w-[130px]`}
          >
            <option value="">All statuses</option>
            {PROJECT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="project-filter">
            Filter projects
          </label>
          <input
            id="project-filter"
            type="search"
            placeholder="Filter projects…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`${inputSm} w-[180px]`}
            autoComplete="off"
          />
        </div>
      </div>

      {projects.isError && !projects.data ? (
        <ErrorState
          compact
          message={errorMessage(projects.error)}
          onRetry={() => projects.refetch()}
          retrying={projects.isFetching}
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #e4e2f7' }}>
                {COLUMNS.map((h) => (
                  <th key={h} scope="col" style={thStyle}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ opacity: refreshing ? 0.6 : 1, transition: 'opacity 0.15s' }}>
              {projects.isPending
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i} style={{ borderBottom: i < 4 ? '1px solid #eeecf9' : 'none' }}>
                      {COLUMNS.map((c, j) => (
                        <td key={c} style={tdStyle}>
                          <Skeleton style={{ height: 12, width: j === 1 ? 160 : j === 3 ? 80 : 56 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : rows.map((p, i) => (
                    <ProjectRow
                      key={p.id}
                      project={p}
                      last={i === rows.length - 1}
                      onOpen={() => navigate(`/projects/${encodeURIComponent(p.id)}/intake`)}
                    />
                  ))}
            </tbody>
          </table>
          {!projects.isPending && rows.length === 0 && (
            <div style={{ padding: '32px 12px', textAlign: 'center', fontSize: 13, color: '#6b6987' }}>
              {filtering ? (
                <>
                  No projects match your filters.{' '}
                  <button
                    type="button"
                    onClick={() => {
                      setFilter('')
                      setStatus('')
                    }}
                    className="font-medium text-primary underline underline-offset-2 cursor-pointer"
                  >
                    Clear filters
                  </button>
                </>
              ) : (
                'No projects yet.'
              )}
            </div>
          )}
          {projects.hasNextPage && (
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <Button variant="secondary" size="sm" onClick={() => projects.fetchNextPage()} loading={projects.isFetchingNextPage}>
                Load more
              </Button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function ProjectRow({ project: p, last, onOpen }: { project: Project; last: boolean; onOpen: () => void }) {
  const progress = Math.max(0, Math.min(100, Math.round(p.progressPct)))
  return (
    <tr
      style={{ borderBottom: last ? 'none' : '1px solid #eeecf9', cursor: 'pointer' }}
      className="hover:bg-[#faf9fe]"
      onClick={(event) => {
        // Let the real link handle modified clicks (new tab etc.).
        if ((event.target as HTMLElement).closest('a')) return
        onOpen()
      }}
    >
      <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', fontSize: 12, color: '#6b6987', whiteSpace: 'nowrap' }}>{p.code}</td>
      <td style={{ ...tdStyle, fontWeight: 500 }}>
        <Link
          to={`/projects/${encodeURIComponent(p.id)}/intake`}
          className="rounded-[2px] text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          {p.name}
        </Link>
        {isAtRisk(p.status) && (
          <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', background: '#fde8ee', color: '#c4506a', borderRadius: 10 }}>Risk</span>
        )}
      </td>
      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
        <StatusLabel status={p.status} />
      </td>
      <td style={tdStyle}>
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${p.name} progress`}
        >
          <div style={{ width: 60, height: 5, background: '#e4e2f7', borderRadius: 3 }}>
            <div style={{ width: `${progress}%`, height: '100%', background: '#4b4a9e', borderRadius: 3 }} />
          </div>
          <span style={{ fontSize: 12, color: '#5a5878' }}>{progress}%</span>
        </div>
      </td>
      <td style={{ ...tdStyle, fontFamily: 'DM Mono, monospace', fontSize: 12, whiteSpace: 'nowrap' }} title={formatMoney(p.budgetCents, p.currency)}>
        {formatMoney(p.budgetCents, p.currency, { compact: true })}
      </td>
      <td style={{ ...tdStyle, fontSize: 12, color: '#5a5878', whiteSpace: 'nowrap' }}>{formatDate(p.targetEndDate)}</td>
      <td style={{ ...tdStyle, fontSize: 12, color: '#5a5878' }}>{p.pmName ?? '—'}</td>
    </tr>
  )
}

function StatusLabel({ status }: { status: ProjectStatus }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: STATUS_COLOR[status], fontWeight: 500 }}>
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[status] }} />
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

/* ─────────────────────────── Side cards ─────────────────────────── */

const LEVEL_STYLE: Record<NotificationLevel, { color: string; label: string }> = {
  info: { color: '#4455aa', label: 'Info' },
  warn: { color: '#a8691f', label: 'Warning' },
  alert: { color: '#c4506a', label: 'Alert' },
}

function NotificationsCard() {
  const notifications = useNotifications()
  const navigate = useNavigate()
  const items = notifications.data ?? []

  return (
    <section style={cardStyle} aria-labelledby="notifications-heading">
      <div className="flex items-center justify-between" style={{ marginBottom: 12 }}>
        <h2 id="notifications-heading" style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>
          Notifications
        </h2>
        {items.length > 0 && (
          <span style={{ fontSize: 11, padding: '1px 7px', borderRadius: 10, background: '#eeecf9', color: '#5a5878' }}>
            {items.length} unread
          </span>
        )}
      </div>
      {notifications.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} style={{ height: 14, width: `${90 - i * 12}%` }} />
          ))}
        </div>
      ) : notifications.isError ? (
        <ErrorState compact message={errorMessage(notifications.error)} onRetry={() => notifications.refetch()} retrying={notifications.isFetching} />
      ) : items.length === 0 ? (
        <div style={{ fontSize: 12, color: '#7d7a99', padding: '4px 0' }}>You&apos;re all caught up.</div>
      ) : (
        <ul style={{ display: 'flex', flexDirection: 'column', margin: 0, padding: 0, listStyle: 'none' }}>
          {items.slice(0, 6).map((n, i, list) => (
            <NotificationItem
              key={n.id}
              notification={n}
              last={i === list.length - 1}
              onOpen={n.projectId ? () => navigate(`/projects/${encodeURIComponent(n.projectId ?? '')}/intake`) : undefined}
            />
          ))}
        </ul>
      )}
    </section>
  )
}

function NotificationItem({ notification: n, last, onOpen }: { notification: AppNotification; last: boolean; onOpen?: () => void }) {
  const level = LEVEL_STYLE[n.level] ?? LEVEL_STYLE.info
  const content = (
    <>
      <span aria-hidden="true" style={{ width: 7, height: 7, borderRadius: '50%', background: level.color, marginTop: 5, flexShrink: 0 }} />
      <span style={{ minWidth: 0 }}>
        <span className="sr-only">{level.label}: </span>
        <span style={{ display: 'block' }}>{n.message}</span>
        <span style={{ display: 'block', fontSize: 11, color: '#7d7a99', marginTop: 2 }}>{formatDateTime(n.createdAt)}</span>
      </span>
    </>
  )
  const style: CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    fontSize: 12,
    color: '#38375a',
    padding: '8px 0',
    width: '100%',
    textAlign: 'left',
    background: 'none',
    border: 'none',
  }
  return (
    <li style={{ borderBottom: last ? 'none' : '1px solid #eeecf9' }}>
      {onOpen ? (
        <button type="button" onClick={onOpen} style={{ ...style, cursor: 'pointer' }} className="hover:text-foreground focus-visible:outline-2 focus-visible:outline-primary">
          {content}
        </button>
      ) : (
        <div style={style}>{content}</div>
      )}
    </li>
  )
}

function AtRiskCard({ orgId }: { orgId: string }) {
  const atRisk = useAtRiskProjects(orgId)

  return (
    <section style={cardStyle} aria-labelledby="at-risk-heading">
      <h2 id="at-risk-heading" style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>
        At-Risk Projects
      </h2>
      {atRisk.isPending ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[0, 1].map((i) => (
            <Skeleton key={i} style={{ height: 84 }} />
          ))}
        </div>
      ) : atRisk.isError ? (
        <ErrorState compact message={errorMessage(atRisk.error)} onRetry={() => atRisk.refetch()} retrying={atRisk.isFetching} />
      ) : atRisk.data.length === 0 ? (
        <div style={{ fontSize: 12, color: '#7d7a99', padding: '4px 0' }}>No projects are at risk right now.</div>
      ) : (
        atRisk.data.map((p) => (
          <div key={p.id} style={{ marginBottom: 12, padding: '10px 12px', background: '#faf9fe', border: '1px solid #e4e2f7', borderRadius: 4 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>{p.name}</div>
            <div style={{ marginBottom: 4 }}>
              <StatusLabel status={p.status} />
            </div>
            <div style={{ fontSize: 11, color: '#7d7a99' }}>
              Due {formatDate(p.targetEndDate)}
              {p.pmName ? ` · ${p.pmName}` : ''}
            </div>
            <Link
              to={`/projects/${encodeURIComponent(p.id)}/optimization`}
              className="inline-block hover:bg-background focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              style={{ marginTop: 8, fontSize: 11, padding: '4px 10px', border: '1px solid #d9d6ee', borderRadius: 3, background: '#fff', color: '#23223a' }}
            >
              View Optimization →
            </Link>
          </div>
        ))
      )}
    </section>
  )
}

/* ─────────────────────────── Empty state ─────────────────────────── */

const FLOW_PREVIEW = [
  { title: 'Describe the project', text: 'Name, dates, budget and team.' },
  { title: 'Let AI do the intake', text: 'Upload briefs or transcripts; AI extracts scope.' },
  { title: 'Review scope & WBS', text: 'Accept deliverables and refine the breakdown.' },
  { title: 'Optimize the plan', text: 'Balance resources against your constraints.' },
]

function EmptyState({ orgName }: { orgName: string }) {
  return (
    <section style={{ ...cardStyle, padding: '48px 40px' }} aria-labelledby="empty-heading">
      <div style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center' }}>
        <div
          aria-hidden="true"
          style={{ width: 52, height: 52, borderRadius: 12, background: '#eeecf9', margin: '0 auto 20px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4b4a9e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18M8 13h5M8 16h8" />
          </svg>
        </div>
        <h2 id="empty-heading" style={{ fontSize: 20, fontWeight: 700, margin: '0 0 8px' }}>
          Plan your first project
        </h2>
        <p style={{ fontSize: 14, color: '#6b6987', lineHeight: 1.6, margin: '0 0 28px' }}>
          {orgName} doesn&apos;t have any projects yet. Create one and NirnAIn will guide you from intake to an optimized
          plan.
        </p>
        <CreateProjectLink large />
      </div>
      <ol
        className="grid"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginTop: 44, padding: 0, listStyle: 'none', borderTop: '1px solid #eeecf9', paddingTop: 28 }}
      >
        {FLOW_PREVIEW.map((step, i) => (
          <li key={step.title}>
            <div className="mono" style={{ fontSize: 11, color: '#7d7a99', marginBottom: 6 }}>
              {String(i + 1).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{step.title}</div>
            <div style={{ fontSize: 12, color: '#6b6987', lineHeight: 1.5 }}>{step.text}</div>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ─────────────────────────── Styles ─────────────────────────── */

const cardStyle: CSSProperties = {
  background: '#fff',
  border: '1px solid #e4e2f7',
  borderRadius: 6,
  padding: '20px 20px',
}

const kpiLabel: CSSProperties = {
  fontSize: 11,
  color: '#6b6987',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: 8,
}

const thStyle: CSSProperties = {
  textAlign: 'left',
  padding: '6px 10px',
  fontSize: 11,
  color: '#6b6987',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  whiteSpace: 'nowrap',
}

const tdStyle: CSSProperties = { padding: '10px 10px' }

const inputSm =
  'rounded-[4px] border border-border bg-white px-2.5 py-1.5 text-xs text-foreground outline-none transition-[border-color,box-shadow] focus:border-primary focus:shadow-[0_0_0_3px_rgba(75,74,158,0.16)]'
