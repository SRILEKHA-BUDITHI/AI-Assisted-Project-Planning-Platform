import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import type { EmailOtpType } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { safeNext } from '@/lib/redirect'
import AuthLayout, { linkClass } from '@/auth/AuthLayout'
import { Alert, FullPageSpinner } from '@/components/ui'

const EMAIL_OTP_TYPES: readonly EmailOtpType[] = ['signup', 'invite', 'magiclink', 'recovery', 'email_change', 'email']

function isEmailOtpType(value: string | null): value is EmailOtpType {
  return value !== null && (EMAIL_OTP_TYPES as readonly string[]).includes(value)
}

/**
 * Landing page for links in auth emails (sign-up confirmation, password reset,
 * email change, invites). The email carries a one-time `token_hash`, so the link
 * works in any browser or device — unlike the PKCE `?code=` flow, which only
 * works in the browser that started it.
 */
export default function AuthConfirm() {
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const handled = useRef(false)

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')
    if (!tokenHash || !isEmailOtpType(type)) {
      setError('This link is incomplete. Open the most recent email from NirnAIn and try again.')
      return
    }
    const next = type === 'recovery' ? '/reset-password' : safeNext(params.get('next'))

    supabase.auth.verifyOtp({ token_hash: tokenHash, type }).then(({ error: verifyError }) => {
      if (verifyError) {
        setError(
          'This link has expired or was already used. If you already confirmed your email, you can sign in now — otherwise request a new link.',
        )
        return
      }
      navigate(next, { replace: true })
    })
  }, [navigate])

  if (!error) return <FullPageSpinner label="Confirming your email" />

  return (
    <AuthLayout
      title="This link didn't work"
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
        Go to sign in
      </Link>
    </AuthLayout>
  )
}
