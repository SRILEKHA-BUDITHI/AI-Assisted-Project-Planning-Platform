import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { supabase } from '@/lib/supabase'
import { authRedirectUrl } from '@/lib/redirect'
import AuthLayout, { linkClass } from '@/auth/AuthLayout'
import { friendlyAuthError } from '@/auth/errors'
import { Alert, Button, TextField } from '@/components/ui'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const emailRef = useRef<HTMLInputElement>(null)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = email.trim()
    if (!/^\S+@\S+\.\S+$/.test(trimmed)) {
      setFieldError(trimmed ? 'Enter a valid email address.' : 'Enter your email address.')
      emailRef.current?.focus()
      return
    }
    setFieldError(null)
    setError(null)
    setSubmitting(true)
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: authRedirectUrl('/reset-password'),
    })
    setSubmitting(false)
    // Only transport/rate-limit failures are surfaced; everything else shows the same
    // confirmation so the form can't be used to discover which emails have accounts.
    const friendly = resetError ? friendlyAuthError(resetError) : null
    if (friendly && (friendly.kind === 'network' || friendly.kind === 'rate_limited')) {
      setError(friendly.message)
      return
    }
    setSentTo(trimmed)
  }

  return (
    <AuthLayout
      title={sentTo ? 'Check your email' : 'Reset your password'}
      subtitle={
        sentTo
          ? undefined
          : "Enter the email you use for ProjectAI and we'll send you a link to choose a new password."
      }
      footer={
        <Link to="/login" className={linkClass}>
          Back to sign in
        </Link>
      }
    >
      {sentTo ? (
        <div aria-live="polite">
          <Alert tone="success" title="Reset link requested">
            If an account exists for <span className="font-semibold">{sentTo}</span>, you&apos;ll receive an email with a
            link to reset your password within a few minutes.
          </Alert>
          <Button
            variant="secondary"
            size="lg"
            block
            className="mt-6"
            onClick={() => {
              setSentTo(null)
              setEmail('')
            }}
          >
            Use a different email
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <div aria-live="assertive" aria-atomic="true">
            {error && (
              <div className="mb-5">
                <Alert tone="error" onDismiss={() => setError(null)}>
                  {error}
                </Alert>
              </div>
            )}
          </div>
          <TextField
            ref={emailRef}
            label="Email address"
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            error={fieldError}
            readOnly={submitting}
            autoFocus
            required
          />
          <Button type="submit" size="lg" block loading={submitting} className="mt-2">
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
