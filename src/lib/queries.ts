import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { apiFetch, isApiError } from './api'
import type {
  AppNotification,
  DashboardSummary,
  Me,
  Member,
  OptimizationRun,
  Page,
  Project,
  ProjectCreate,
  ProjectStatus,
  ProjectUpdate,
} from './types'

export interface ProjectFilters {
  q?: string
  status?: ProjectStatus
  limit?: number
}

export const queryKeys = {
  me: ['me'] as const,
  projects: (orgId: string) => ['orgs', orgId, 'projects'] as const,
  projectList: (orgId: string, filters: ProjectFilters) => ['orgs', orgId, 'projects', 'list', filters] as const,
  atRisk: (orgId: string) => ['orgs', orgId, 'projects', 'at-risk'] as const,
  project: (projectId: string) => ['projects', projectId] as const,
  dashboard: (orgId: string) => ['orgs', orgId, 'dashboard'] as const,
  members: (orgId: string) => ['orgs', orgId, 'members'] as const,
  notifications: ['notifications', { unread: true }] as const,
  latestRun: (projectId: string) => ['projects', projectId, 'optimization', 'latest'] as const,
}

function projectListPath(orgId: string, filters: ProjectFilters, cursor: string | null): string {
  const params = new URLSearchParams()
  if (filters.status) params.set('status', filters.status)
  if (filters.q) params.set('q', filters.q)
  params.set('limit', String(filters.limit ?? 25))
  if (cursor) params.set('cursor', cursor)
  return `/api/v1/orgs/${encodeURIComponent(orgId)}/projects?${params.toString()}`
}

export function useMe(enabled = true) {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: ({ signal }) => apiFetch<Me>('/api/v1/me', { signal }),
    enabled,
    staleTime: 5 * 60_000,
  })
}

export function useProjects(orgId: string, filters: ProjectFilters) {
  return useInfiniteQuery({
    queryKey: queryKeys.projectList(orgId, filters),
    queryFn: ({ pageParam, signal }) => apiFetch<Page<Project>>(projectListPath(orgId, filters, pageParam), { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  })
}

/** Projects that need attention: at-risk and delayed, soonest deadline first. */
export function useAtRiskProjects(orgId: string, limit = 5) {
  return useQuery({
    queryKey: queryKeys.atRisk(orgId),
    queryFn: async ({ signal }) => {
      const [atRisk, delayed] = await Promise.all(
        (['at_risk', 'delayed'] as const).map((status) =>
          apiFetch<Page<Project>>(projectListPath(orgId, { status, limit }, null), { signal }),
        ),
      )
      return [...atRisk.items, ...delayed.items]
        // Soonest due first; projects without a target date go last.
        .sort((a, b) => (a.targetEndDate ?? '9999-12-31').localeCompare(b.targetEndDate ?? '9999-12-31'))
        .slice(0, limit)
    },
  })
}

export function useProject(projectId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.project(projectId ?? ''),
    queryFn: ({ signal }) => apiFetch<Project>(`/api/v1/projects/${encodeURIComponent(projectId ?? '')}`, { signal }),
    enabled: Boolean(projectId),
  })
}

export function useDashboard(orgId: string) {
  return useQuery({
    queryKey: queryKeys.dashboard(orgId),
    queryFn: ({ signal }) =>
      apiFetch<DashboardSummary>(`/api/v1/orgs/${encodeURIComponent(orgId)}/dashboard`, { signal }),
  })
}

export function useMembers(orgId: string) {
  return useQuery({
    queryKey: queryKeys.members(orgId),
    queryFn: ({ signal }) => apiFetch<Member[]>(`/api/v1/orgs/${encodeURIComponent(orgId)}/members`, { signal }),
    staleTime: 5 * 60_000,
  })
}

export function useNotifications() {
  return useQuery({
    queryKey: queryKeys.notifications,
    // The API returns a cursor page ({ items, nextCursor }); the dashboard shows the first page.
    queryFn: async ({ signal }) => (await apiFetch<Page<AppNotification>>('/api/v1/notifications?unread=true', { signal })).items,
    refetchInterval: 60_000,
  })
}

function useInvalidateOrgProjects() {
  const qc = useQueryClient()
  return (orgId: string) =>
    Promise.all([
      qc.invalidateQueries({ queryKey: queryKeys.projects(orgId) }),
      qc.invalidateQueries({ queryKey: queryKeys.dashboard(orgId) }),
    ])
}

export function useCreateProject(orgId: string) {
  const qc = useQueryClient()
  const invalidate = useInvalidateOrgProjects()
  return useMutation({
    mutationFn: (body: ProjectCreate) =>
      apiFetch<Project>(`/api/v1/orgs/${encodeURIComponent(orgId)}/projects`, { method: 'POST', json: body }),
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(project.id), project)
      return invalidate(orgId)
    },
  })
}

export function useUpdateProject() {
  const qc = useQueryClient()
  const invalidate = useInvalidateOrgProjects()
  return useMutation({
    mutationFn: ({ projectId, patch }: { projectId: string; patch: ProjectUpdate }) =>
      apiFetch<Project>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: 'PATCH', json: patch }),
    onSuccess: (project) => {
      qc.setQueryData(queryKeys.project(project.id), project)
      return invalidate(project.orgId)
    },
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  const invalidate = useInvalidateOrgProjects()
  return useMutation({
    mutationFn: ({ projectId }: { projectId: string; orgId: string }) =>
      apiFetch<void>(`/api/v1/projects/${encodeURIComponent(projectId)}`, { method: 'DELETE' }),
    onSuccess: (_data, { projectId, orgId }) => {
      qc.removeQueries({ queryKey: queryKeys.project(projectId) })
      return invalidate(orgId)
    },
  })
}

const RUN_POLL_MS = 2000

function runPath(projectId: string, suffix = ''): string {
  return `/api/v1/projects/${encodeURIComponent(projectId)}/optimization/runs${suffix}`
}

/** Latest optimization run for a project (`null` when none yet); polls while it is queued or running. */
export function useLatestRun(projectId: string) {
  return useQuery({
    queryKey: queryKeys.latestRun(projectId),
    queryFn: async ({ signal }) => {
      try {
        return await apiFetch<OptimizationRun>(runPath(projectId, '/latest'), { signal })
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null
        throw error
      }
    },
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'queued' || status === 'running' ? RUN_POLL_MS : false
    },
  })
}

export function useStartRun(projectId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => apiFetch<OptimizationRun>(runPath(projectId), { method: 'POST', json: {} }),
    onSuccess: (run) => queryClient.setQueryData(queryKeys.latestRun(projectId), run),
    onError: (error) => {
      // Someone else already started one: show it.
      if (isApiError(error) && error.status === 409) void queryClient.invalidateQueries({ queryKey: queryKeys.latestRun(projectId) })
    },
  })
}
