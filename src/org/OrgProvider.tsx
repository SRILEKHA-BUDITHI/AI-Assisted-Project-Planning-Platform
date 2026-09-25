import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useAuth } from '@/auth/useAuth'
import { errorMessage } from '@/lib/api'
import { useMe } from '@/lib/queries'
import { BrandMark } from '@/auth/AuthLayout'
import { Button, ErrorState, FullPageSpinner } from '@/components/ui'
import { OrgContext, type OrgContextValue } from './useOrg'

const STORAGE_KEY = 'projectai:org-id'

function readStoredOrgId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/** Loads `/me` and resolves the active organization before rendering the app. */
export default function OrgProvider({ children }: { children: ReactNode }) {
  const { signOut } = useAuth()
  const meQuery = useMe()
  const [selectedId, setSelectedId] = useState<string | null>(readStoredOrgId)

  const selectOrg = useCallback((orgId: string) => {
    setSelectedId(orgId)
    try {
      localStorage.setItem(STORAGE_KEY, orgId)
    } catch {
      // Non-persistent selection is fine.
    }
  }, [])

  const me = meQuery.data
  const value = useMemo<OrgContextValue | null>(() => {
    if (!me || me.organizations.length === 0) return null
    const org = me.organizations.find((o) => o.id === selectedId) ?? me.organizations[0]!
    return { me, organizations: me.organizations, org, selectOrg }
  }, [me, selectedId, selectOrg])

  if (meQuery.isPending) return <FullPageSpinner label="Loading your workspace" />

  if (meQuery.isError) {
    return (
      <CenteredCard>
        <ErrorState
          title="We couldn't load your workspace"
          message={errorMessage(meQuery.error)}
          onRetry={() => meQuery.refetch()}
          retrying={meQuery.isFetching}
        />
        <div className="text-center">
          <button type="button" onClick={signOut} className="text-[13px] text-[#737373] underline underline-offset-2 hover:text-[#2d2d2d] cursor-pointer">
            Sign out
          </button>
        </div>
      </CenteredCard>
    )
  }

  if (!value) {
    return (
      <CenteredCard>
        <div className="py-6 text-center">
          <div className="text-base font-semibold">You&apos;re not part of an organization yet</div>
          <p className="mx-auto mt-2 max-w-sm text-[13px] leading-5 text-[#737373]">
            Signed in as <span className="font-medium text-[#3a3a3a]">{me?.email}</span>. Ask an administrator to invite
            you to their organization, then refresh this page.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button variant="secondary" onClick={() => meQuery.refetch()} loading={meQuery.isFetching}>
              Refresh
            </Button>
            <Button onClick={signOut}>Sign out</Button>
          </div>
        </div>
      </CenteredCard>
    )
  }

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>
}

function CenteredCard({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f7f7] px-6">
      <div className="w-full max-w-md rounded-md border border-[#e8e8e8] bg-white px-8 py-8">
        <div className="mb-2 flex items-center justify-center gap-2">
          <BrandMark size={26} />
          <span className="text-sm font-semibold">ProjectAI</span>
        </div>
        {children}
      </div>
    </div>
  )
}
