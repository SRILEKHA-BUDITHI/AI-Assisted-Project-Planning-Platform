/** Backend contract types (camelCase JSON from `/api/v1`). */

export const PROJECT_TYPES = [
  'technology',
  'construction',
  'product_development',
  'business_process',
  'compliance',
] as const
export type ProjectType = (typeof PROJECT_TYPES)[number]

export const PRIORITIES = ['high', 'medium', 'low'] as const
export type Priority = (typeof PRIORITIES)[number]

export const METHODOLOGIES = ['waterfall', 'agile', 'hybrid', 'kanban'] as const
export type Methodology = (typeof METHODOLOGIES)[number]

export const VISIBILITIES = ['internal', 'client_facing', 'confidential'] as const
export type Visibility = (typeof VISIBILITIES)[number]

export const PROJECT_STATUSES = [
  'draft',
  'planning',
  'on_track',
  'at_risk',
  'delayed',
  'completed',
  'archived',
] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const PROJECT_STEPS = ['create', 'intake', 'scope', 'wbs', 'constraints', 'optimize', 'done'] as const
export type ProjectStep = (typeof PROJECT_STEPS)[number]

export const PROJECT_TYPE_LABELS: Record<ProjectType, string> = {
  technology: 'Technology / IT',
  construction: 'Construction',
  product_development: 'Product Development',
  business_process: 'Business Process',
  compliance: 'Compliance / Regulatory',
}

export const PRIORITY_LABELS: Record<Priority, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}

export const METHODOLOGY_LABELS: Record<Methodology, string> = {
  waterfall: 'Waterfall',
  agile: 'Agile / Scrum',
  hybrid: 'Hybrid',
  kanban: 'Kanban',
}

export const VISIBILITY_LABELS: Record<Visibility, string> = {
  internal: 'Internal',
  client_facing: 'Client-Facing',
  confidential: 'Confidential',
}

export const STATUS_LABELS: Record<ProjectStatus, string> = {
  draft: 'Draft',
  planning: 'Planning',
  on_track: 'On Track',
  at_risk: 'At Risk',
  delayed: 'Delayed',
  completed: 'Completed',
  archived: 'Archived',
}

export type OrgRole = 'owner' | 'admin' | 'member' | 'viewer' | (string & {})

export interface OrganizationMembership {
  id: string
  name: string
  slug: string
  role: OrgRole
}

export interface Me {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  jobTitle: string | null
  organizations: OrganizationMembership[]
}

export interface Project {
  id: string
  orgId: string
  code: string
  name: string
  description: string
  type: ProjectType
  department: string | null
  sponsor: string | null
  pmUserId: string | null
  pmName: string | null
  priority: Priority
  methodology: Methodology
  visibility: Visibility
  /** ISO date `YYYY-MM-DD`. */
  startDate: string
  /** ISO date `YYYY-MM-DD`. */
  targetEndDate: string
  budgetCents: number
  currency: string
  status: ProjectStatus
  currentStep: ProjectStep
  progressPct: number
  createdAt: string
  updatedAt: string
}

export interface ProjectCreate {
  name: string
  description: string
  type: ProjectType
  department: string | null
  sponsor: string | null
  pmUserId: string | null
  priority: Priority
  methodology: Methodology
  visibility: Visibility
  startDate: string
  targetEndDate: string
  budgetCents: number
  currency: string
  status: ProjectStatus
  currentStep: ProjectStep
}

export type ProjectUpdate = Partial<ProjectCreate> & { progressPct?: number }

export interface Page<T> {
  items: T[]
  nextCursor: string | null
}

export interface DashboardSummary {
  totalProjects: number
  onTrack: number
  atRiskOrDelayed: number
  totalBudgetCents: number
  createdThisMonth: number
}

export interface Member {
  userId: string
  fullName: string | null
  email: string
  role: OrgRole
}

export type NotificationLevel = 'info' | 'warn' | 'alert'

export interface AppNotification {
  id: string
  level: NotificationLevel
  message: string
  projectId: string | null
  readAt: string | null
  createdAt: string
}
