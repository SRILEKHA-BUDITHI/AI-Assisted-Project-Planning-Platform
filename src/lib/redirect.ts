const AUTH_PATHS = ['/login', '/signup', '/check-email', '/forgot-password', '/auth/callback']

/**
 * Returns `raw` only if it is a same-origin relative path (prevents open redirects
 * via `?next=https://evil.example` or `//evil.example`); otherwise `fallback`.
 */
export function safeNext(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback
  try {
    const url = new URL(raw, window.location.origin)
    if (url.origin !== window.location.origin) return fallback
    if (AUTH_PATHS.includes(url.pathname)) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}

/** `next` survives the OAuth round-trip here, so the provider redirect URL stays exact. */
const NEXT_STORAGE_KEY = 'projectai:auth-next'

export function rememberNext(next: string): void {
  try {
    if (next && next !== '/') sessionStorage.setItem(NEXT_STORAGE_KEY, next)
    else sessionStorage.removeItem(NEXT_STORAGE_KEY)
  } catch {
    // Storage can be unavailable (private mode); losing `next` is harmless.
  }
}

export function takeRememberedNext(): string | null {
  try {
    const value = sessionStorage.getItem(NEXT_STORAGE_KEY)
    sessionStorage.removeItem(NEXT_STORAGE_KEY)
    return value
  } catch {
    return null
  }
}

export function authRedirectUrl(next?: string): string {
  const base = `${window.location.origin}/auth/callback`
  return next ? `${base}?next=${encodeURIComponent(next)}` : base
}
