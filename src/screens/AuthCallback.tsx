import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import { safeNext, takeRememberedNext } from '@/lib/redirect'
import AuthLayout, { linkClass } from '@/auth/AuthLayout'
import { Alert, FullPageSpinner } from '@/components/ui'

/** Reads `error_description` from the query string or hash (Supabase uses both). */
function readUrlError(): string | null {
  const query = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const description = query.get('error_description') ?? hash.get('error_description')
  const code = query.get('error') ?? hash.get('error')
  if (!description && !code) return null
  return (description ?? code ?? '').replace(/\+/g, ' ')
}

/**
 * Landing page for OAuth, email-confirmation, magic-link and password-recovery
 * redirects. The Supabase client (`detectSessionInUrl` + PKCE) exchanges the
 * `?code=` automatically on start-up; we wait for that, then route onwards.
 */
export default function AuthCallback() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [confirmedElsewhere, setConfirmedElsewhere] = useState(false)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const urlError = readUrlError()
    const remembered = takeRememberedNext()
    if (urlError) {
      setError(urlError)
      return
    }
    const next = safeNext(new URLSearchParams(window.location.search).get('next') ?? remembered)

    // Supabase only issues `?code=` after it has verified the email, so a code
    // that can't be exchanged here means the link was opened in a different
    // browser than the one that signed up: the email *is* confirmed.
    const hadCode = new URLSearchParams(window.location.search).has('code')

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate(next, { replace: true })
      } else if (hadCode && next === '/reset-password') {
        setError(
          'Password reset links must be opened in the same browser you requested them from. Request a new link from this device to continue.',
        )
      } else if (hadCode) {
        setConfirmedElsewhere(true)
      } else {
        setError(
          "We couldn't complete sign-in from this link. It may have expired or already been used. If you just confirmed your email, you can sign in now.",
        )
      }
    })
  }, [navigate])

  if (confirmedElsewhere) {
    return (
      <AuthLayout title="Your email is confirmed" subtitle="Your NirnAIn account is ready.">
        <Alert tone="success">Sign in with your email and password to open your workspace on this device.</Alert>
        <Link
          to="/login"
          className="mt-6 flex w-full items-center justify-center rounded-[4px] bg-primary px-4 py-[11px] text-sm font-semibold text-white hover:bg-[#3d3c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Sign in
        </Link>
      </AuthLayout>
    )
  }

  if (!error) return <FullPageSpinner label="Signing you in" />

  return (
    <AuthLayout
      title="We couldn't sign you in"
      footer={
        <Link to="/forgot-password" className={linkClass}>
          Need a new password reset link?
        </Link>
      }
    >
      <Alert tone="error">{error}</Alert>
      <Link
        to="/login"
        className="mt-6 flex w-full items-center justify-center rounded-[4px] bg-primary px-4 py-[11px] text-sm font-semibold text-white hover:bg-[#3d3c85] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Back to sign in
      </Link>
    </AuthLayout>
  )
}
