import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { supabase } from '@/lib/supabase'
import AuthLayout, { linkClass } from '@/auth/AuthLayout'
import { useAuth } from '@/auth/useAuth'
import { friendlyAuthError } from '@/auth/errors'
import { passwordMeetsPolicy } from '@/auth/password'
import { Alert, Button, FullPageSpinner, PasswordChecklist, PasswordField } from '@/components/ui'

export default function ResetPassword() {
  const { session, loading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({})
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const passwordRef = useRef<HTMLInputElement>(null)
  const confirmRef = useRef<HTMLInputElement>(null)

  if (loading) return <FullPageSpinner label="Verifying your reset link" />

  if (!session) {
    return (
      <AuthLayout
        title="Link expired"
        subtitle="This password reset link is invalid or has expired. Reset links can only be used once."
        footer={
          <Link to="/login" className={linkClass}>
            Back to sign in
          </Link>
        }
      >
        <Link
          to="/forgot-password"
          className="flex w-full items-center justify-center rounded-[4px] bg-[#2d2d2d] px-4 py-[11px] text-sm font-semibold text-white hover:bg-[#1f1f1f] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2d2d2d]"
        >
          Request a new link
        </Link>
      </AuthLayout>
    )
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors: typeof fieldErrors = {}
    if (!passwordMeetsPolicy(password)) errors.password = 'Your password must meet every requirement below.'
    if (!confirm) errors.confirm = 'Confirm your new password.'
    else if (confirm !== password) errors.confirm = "Passwords don't match."
    setFieldErrors(errors)
    if (errors.password) return passwordRef.current?.focus()
    if (errors.confirm) return confirmRef.current?.focus()

    setSubmitting(true)
    setError(null)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(friendlyAuthError(updateError).message)
      setSubmitting(false)
      return
    }
    navigate('/', { replace: true, state: { notice: 'Your password has been updated.' } })
  }

  const confirmMismatch = confirm.length > 0 && confirm !== password

  return (
    <AuthLayout
      title="Choose a new password"
      subtitle={
        <>
          Setting a new password for <span className="font-semibold text-[#1a1a1a]">{session.user.email}</span>.
        </>
      }
    >
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
        {/* Lets password managers associate the new password with the right account. */}
        <input type="email" name="email" autoComplete="username" value={session.user.email ?? ''} readOnly hidden />
        <PasswordField
          ref={passwordRef}
          label="New password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          readOnly={submitting}
          autoFocus
          required
          hint={<PasswordChecklist password={password} />}
        />
        <PasswordField
          ref={confirmRef}
          label="Confirm new password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm ?? (confirmMismatch ? "Passwords don't match." : undefined)}
          readOnly={submitting}
          required
        />
        <Button type="submit" size="lg" block loading={submitting} className="mt-2">
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}
