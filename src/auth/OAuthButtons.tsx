import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { authRedirectUrl, rememberNext } from '@/lib/redirect'
import { Button } from '@/components/ui'
import { friendlyAuthError } from './errors'

export type OAuthProvider = 'google' | 'azure'

interface Props {
  /** Where to land after the provider round-trip (already validated). */
  next: string
  disabled?: boolean
  onPendingChange?: (pending: boolean) => void
  onError: (message: string) => void
}

export default function OAuthButtons({ next, disabled, onPendingChange, onError }: Props) {
  const [pending, setPending] = useState<OAuthProvider | null>(null)

  async function start(provider: OAuthProvider) {
    setPending(provider)
    onPendingChange?.(true)
    rememberNext(next)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: authRedirectUrl(),
        scopes: provider === 'azure' ? 'email openid profile' : undefined,
      },
    })
    // On success the browser is already navigating to the provider; keep the spinner.
    if (error) {
      setPending(null)
      onPendingChange?.(false)
      onError(friendlyAuthError(error).message)
    }
  }

  return (
    <div className="grid gap-2.5">
      <Button
        variant="secondary"
        size="lg"
        block
        loading={pending === 'google'}
        disabled={disabled || pending !== null}
        onClick={() => start('google')}
      >
        <GoogleLogo />
        Continue with Google
      </Button>
      <Button
        variant="secondary"
        size="lg"
        block
        loading={pending === 'azure'}
        disabled={disabled || pending !== null}
        onClick={() => start('azure')}
      >
        <MicrosoftLogo />
        Continue with Microsoft
      </Button>
    </div>
  )
}

export function Divider({ label = 'or' }: { label?: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.08em] text-[#a3a3a3]" role="separator">
      <span className="h-px flex-1 bg-[#e3e3e3]" />
      {label}
      <span className="h-px flex-1 bg-[#e3e3e3]" />
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}

function MicrosoftLogo() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 23 23">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  )
}
