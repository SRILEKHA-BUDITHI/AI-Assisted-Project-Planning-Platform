import { useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { supabase } from '@/lib/supabase'
import { authRedirectUrl, safeNext } from '@/lib/redirect'
import AuthLayout, { linkClass } from '@/auth/AuthLayout'
import OAuthButtons, { Divider } from '@/auth/OAuthButtons'
import { friendlyAuthError, type FriendlyAuthError } from '@/auth/errors'
import { Alert, Button, PasswordField, TextField } from '@/components/ui'

type ResendState = 'idle' | 'sending' | 'sent' | 'failed'

export default function Login() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const nextQuery = next !== '/' ? `?next=${encodeURIComponent(next)}` : ''

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const [error, setError] = useState<FriendlyAuthError | null>(null)
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({})
  const [resend, setResend] = useState<ResendState>('idle')
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  const busy = submitting || oauthPending

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    const errors: typeof fieldErrors = {}
    if (!trimmed) errors.email = 'Enter your email address.'
    else if (!/^\S+@\S+\.\S+$/.test(trimmed)) errors.email = 'Enter a valid email address.'
    if (!password) errors.password = 'Enter your password.'
    setFieldErrors(errors)
    if (errors.email) return emailRef.current?.focus()
    if (errors.password) return passwordRef.current?.focus()

    setSubmitting(true)
    setError(null)
    setResend('idle')
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: trimmed, password })
    if (signInError) {
      setError(friendlyAuthError(signInError))
      setSubmitting(false)
      passwordRef.current?.select()
    }
    // On success the auth listener updates the session and <PublicOnly> redirects to `next`.
  }

  async function resendConfirmation() {
    setResend('sending')
    const { error: resendError } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      options: { emailRedirectTo: authRedirectUrl() },
    })
    setResend(resendError ? 'failed' : 'sent')
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Access your project workspace"
      footer={
        <>
          New to ProjectAI?{' '}
          <Link to={`/signup${nextQuery}`} className={linkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <div aria-live="assertive" aria-atomic="true">
        {error && (
          <div className="mb-5">
            <Alert
              tone="error"
              onDismiss={() => setError(null)}
              action={
                error.kind === 'email_not_confirmed' ? (
                  resend === 'sent' ? (
                    <span className="font-medium">Confirmation email sent to {email.trim()}.</span>
                  ) : (
                    <button
                      type="button"
                      onClick={resendConfirmation}
                      disabled={resend === 'sending'}
                      className="font-semibold underline underline-offset-2 disabled:opacity-60 cursor-pointer"
                    >
                      {resend === 'sending'
                        ? 'Sending…'
                        : resend === 'failed'
                          ? "Couldn't send — try again"
                          : 'Resend confirmation email'}
                    </button>
                  )
                ) : error.kind === 'invalid_credentials' ? (
                  <Link to="/forgot-password" className="font-semibold underline underline-offset-2">
                    Reset your password
                  </Link>
                ) : undefined
              }
            >
              {error.message}
            </Alert>
          </div>
        )}
      </div>

      <OAuthButtons
        next={next}
        disabled={submitting}
        onPendingChange={setOauthPending}
        onError={(message) => setError({ kind: 'unknown', message })}
      />

      <Divider label="or sign in with email" />

      <form onSubmit={onSubmit} noValidate>
        <TextField
          ref={emailRef}
          label="Email address"
          type="email"
          name="email"
          autoComplete="username"
          inputMode="email"
          autoCapitalize="off"
          spellCheck={false}
          placeholder="you@company.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          readOnly={busy}
          required
        />
        <PasswordField
          ref={passwordRef}
          label="Password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          readOnly={busy}
          required
          labelAside={
            <Link to="/forgot-password" className={`text-[13px] ${linkClass}`}>
              Forgot password?
            </Link>
          }
        />
        <Button type="submit" size="lg" block loading={submitting} disabled={oauthPending} className="mt-2">
          Sign in
        </Button>
      </form>
    </AuthLayout>
  )
}
