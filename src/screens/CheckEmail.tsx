import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { supabase } from '@/lib/supabase'
import { authRedirectUrl } from '@/lib/redirect'
import AuthLayout, { linkClass } from '@/auth/AuthLayout'
import { friendlyAuthError } from '@/auth/errors'
import { Alert, Button } from '@/components/ui'

const RESEND_COOLDOWN_SECONDS = 60

function emailFromState(state: unknown): string | null {
  if (typeof state === 'object' && state !== null && 'email' in state) {
    const email = (state as { email: unknown }).email
    return typeof email === 'string' && email ? email : null
  }
  return null
}

export default function CheckEmail() {
  const location = useLocation()
  const email = emailFromState(location.state)
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_SECONDS)
  const [sending, setSending] = useState(false)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    if (cooldown <= 0) return
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => window.clearTimeout(timer)
  }, [cooldown])

  async function resend() {
    if (!email) return
    setSending(true)
    setMessage(null)
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: authRedirectUrl() },
    })
    setSending(false)
    if (error) {
      setMessage({ tone: 'error', text: friendlyAuthError(error).message })
    } else {
      setMessage({ tone: 'success', text: 'A new confirmation link is on its way.' })
      setCooldown(RESEND_COOLDOWN_SECONDS)
    }
  }

  return (
    <AuthLayout
      title="Check your email"
      subtitle={
        email ? (
          <>
            We sent a confirmation link to <span className="font-semibold text-[#1a1a1a]">{email}</span>. Open it on
            this device to activate your account.
          </>
        ) : (
          'We sent you a confirmation link. Open it on this device to activate your account.'
        )
      }
      footer={
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-full bg-[#ececec] text-[#2d2d2d]">
        <svg aria-hidden="true" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3.5 6.5l8.5 6 8.5-6" />
        </svg>
      </div>

      <ul className="mb-6 space-y-2 text-[13px] leading-5 text-[#555]">
        <li>• The link expires after 24 hours.</li>
        <li>• Can&apos;t find it? Check your spam or promotions folder.</li>
      </ul>

      <div aria-live="polite" aria-atomic="true">
        {message && (
          <div className="mb-4">
            <Alert tone={message.tone}>{message.text}</Alert>
          </div>
        )}
      </div>

      {email && (
        <Button variant="secondary" size="lg" block onClick={resend} loading={sending} disabled={cooldown > 0}>
          {cooldown > 0 ? `Resend email in ${cooldown}s` : 'Resend confirmation email'}
        </Button>
      )}
    </AuthLayout>
  )
}
