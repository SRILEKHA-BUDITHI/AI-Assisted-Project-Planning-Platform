import { useCallback } from 'react'
import { useNavigate, useParams } from 'react-router'

/** The numbered planning flow. `segment` is the route under `/projects/:projectId/`. */
export const FLOW_STEPS = [
  { key: 'create', label: 'Create Project', segment: null },
  { key: 'intake', label: 'AI Project Intake', segment: 'intake' },
  { key: 'scope', label: 'Scope Review', segment: 'scope' },
  { key: 'wbs', label: 'WBS Builder', segment: 'wbs' },
  { key: 'constraints', label: 'Constraints', segment: 'constraints' },
  { key: 'optimization', label: 'Optimization Results', segment: 'optimization' },
] as const

export type FlowStepKey = (typeof FLOW_STEPS)[number]['key']

export function stepPath(step: FlowStepKey, projectId: string | undefined): string {
  const def = FLOW_STEPS.find((s) => s.key === step)
  if (!def?.segment || !projectId) return '/projects/new'
  return `/projects/${encodeURIComponent(projectId)}/${def.segment}`
}

/** Navigate between flow steps of the project in the current URL. */
export function useStepNav(): (step: FlowStepKey) => void {
  const navigate = useNavigate()
  const { projectId } = useParams()
  return useCallback((step: FlowStepKey) => navigate(stepPath(step, projectId)), [navigate, projectId])
}
