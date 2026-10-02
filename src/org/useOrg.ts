import { createContext, useContext } from 'react'
import type { Me, OrganizationMembership } from '@/lib/types'

export interface OrgContextValue {
  me: Me
  organizations: OrganizationMembership[]
  /** The organization every org-scoped query uses. */
  org: OrganizationMembership
  /** Switch the active organization (for a future org switcher). */
  selectOrg: (orgId: string) => void
}

export const OrgContext = createContext<OrgContextValue | null>(null)

export function useOrg(): OrgContextValue {
  const value = useContext(OrgContext)
  if (!value) throw new Error('useOrg must be used inside <OrgProvider>')
  return value
}
