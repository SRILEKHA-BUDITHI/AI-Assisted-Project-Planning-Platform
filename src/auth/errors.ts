import { isAuthError } from '@supabase/supabase-js'

export type AuthErrorKind =
  | 'invalid_credentials'
  | 'email_not_confirmed'
  | 'rate_limited'
  | 'network'
  | 'user_exists'
  | 'weak_password'
  | 'same_password'
  | 'provider_disabled'
  | 'session_missing'
  | 'unknown'

export interface FriendlyAuthError {
  kind: AuthErrorKind
  message: string
}

/** Maps Supabase Auth errors to copy we are happy to show users. */
export function friendlyAuthError(error: unknown): FriendlyAuthError {
  if (!isAuthError(error)) {
    return { kind: 'unknown', message: 'Something went wrong. Please try again.' }
  }
  const code = error.code ?? ''
  const message = error.message ?? ''

  if (error.name === 'AuthRetryableFetchError' || error.status === 0) {
    return { kind: 'network', message: "We couldn't reach the sign-in service. Check your connection and try again." }
  }
  if (code === 'invalid_credentials' || /invalid login credentials/i.test(message)) {
    return {
      kind: 'invalid_credentials',
      message: "That email and password combination didn't work. Check them and try again, or reset your password.",
    }
  }
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(message)) {
    return {
      kind: 'email_not_confirmed',
      message: 'Please confirm your email address before signing in. Check your inbox for the confirmation link.',
    }
  }
  if (error.status === 429 || code.startsWith('over_') || /rate limit/i.test(message)) {
    return { kind: 'rate_limited', message: 'Too many attempts. Please wait a minute and try again.' }
  }
  if (code === 'user_already_exists' || code === 'email_exists' || /already registered/i.test(message)) {
    return { kind: 'user_exists', message: 'An account with this email already exists. Sign in instead.' }
  }
  if (code === 'weak_password') {
    return { kind: 'weak_password', message: 'That password is too weak. Choose a longer password that meets every requirement.' }
  }
  if (code === 'same_password') {
    return { kind: 'same_password', message: 'Your new password must be different from your current one.' }
  }
  if (/provider is not enabled|unsupported provider/i.test(message)) {
    return { kind: 'provider_disabled', message: "This sign-in method isn't enabled yet. Use email and password instead." }
  }
  if (code === 'session_not_found' || error.name === 'AuthSessionMissingError') {
    return { kind: 'session_missing', message: 'Your session has expired. Please request a new link.' }
  }
  return { kind: 'unknown', message: message || 'Something went wrong. Please try again.' }
}
