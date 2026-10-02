import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { supabase } from '@/lib/supabase'
import { authRedirectUrl, safeNext } from '@/lib/redirect'
import AuthLayout, { linkClass } from '@/auth/AuthLayout'
import OAuthButtons, { Divider } from '@/auth/OAuthButtons'
import { friendlyAuthError } from '@/auth/errors'
import { passwordMeetsPolicy } from '@/auth/password'
import { Alert, Button, PasswordChecklist, PasswordField, TextField } from '@/components/ui'

interface FieldErrors {
  fullName?: string
  email?: string
  password?: string
  confirm?: string
}

export default function Signup() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))

  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [oauthPending, setOauthPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const refs = {
    fullName: useRef<HTMLInputElement>(null),
    email: useRef<HTMLInputElement>(null),
    password: useRef<HTMLInputElement>(null),
    confirm: useRef<HTMLInputElement>(null),
  }

  const busy = submitting || oauthPending
  const confirmMismatch = confirm.length > 0 && confirm !== password

  function validate(): FieldErrors {
    const errors: FieldErrors = {}
    if (!fullName.trim()) errors.fullName = 'Enter your full name.'
    const trimmed = email.trim()
    if (!trimmed) errors.email = 'Enter your work email.'
    else if (!/^\S+@\S+\.\S+$/.test(trimmed)) errors.email = 'Enter a valid email address.'
    if (!passwordMeetsPolicy(password)) errors.password = 'Your password must meet every requirement below.'
    if (!confirm) errors.confirm = 'Confirm your password.'
    else if (confirm !== password) errors.confirm = "Passwords don't match."
    return errors
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validate()
    setFieldErrors(errors)
    const firstInvalid = (Object.keys(refs) as (keyof FieldErrors)[]).find((key) => errors[key])
    if (firstInvalid) return refs[firstInvalid].current?.focus()

    setSubmitting(true)
    setError(null)
    const trimmedEmail = email.trim()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: trimmedEmail,
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: authRedirectUrl() },
    })
    if (signUpError) {
      setError(friendlyAuthError(signUpError).message)
      setSubmitting(false)
      return
    }
    // With email confirmation disabled Supabase returns a live session; go straight in.
    if (data.session) navigate(next, { replace: true })
    else navigate('/check-email', { replace: true, state: { email: trimmedEmail } })
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Start planning projects with AI in minutes."
      footer={
        <>
          Already have an account?{' '}
          <Link to={next !== '/' ? `/login?next=${encodeURIComponent(next)}` : '/login'} className={linkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <div aria-live="assertive" aria-atomic="true">
        {error && (
          <div className="mb-5">
            <Alert tone="error" onDismiss={() => setError(null)}>
              {error}
            </Alert>
          </div>
        )}
      </div>

      <OAuthButtons next={next} disabled={submitting} onPendingChange={setOauthPending} onError={setError} />

      <Divider label="or sign up with email" />

      <form onSubmit={onSubmit} noValidate>
        <TextField
          ref={refs.fullName}
          label="Full name"
          name="name"
          autoComplete="name"
          placeholder="Alex Morgan"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          error={fieldErrors.fullName}
          readOnly={busy}
          required
        />
        <TextField
          ref={refs.email}
          label="Work email"
          type="email"
          name="email"
          autoComplete="email"
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
          ref={refs.password}
          label="Password"
          name="new-password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
          readOnly={busy}
          required
          hint={<PasswordChecklist password={password} />}
        />
        <PasswordField
          ref={refs.confirm}
          label="Confirm password"
          name="confirm-password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={fieldErrors.confirm ?? (confirmMismatch ? "Passwords don't match." : undefined)}
          readOnly={busy}
          required
        />
        <Button type="submit" size="lg" block loading={submitting} disabled={oauthPending} className="mt-2">
          Create account
        </Button>
        <p className="mt-4 text-center text-xs leading-5 text-[#8a8a8a]">
          By creating an account you agree to your organization&apos;s acceptable use policy.
        </p>
      </form>
    </AuthLayout>
  )
}
