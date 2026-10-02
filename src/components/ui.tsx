import {
  useId,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react'
import { PASSWORD_RULES } from '@/auth/password'

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/* ─────────────────────────── Spinner ─────────────────────────── */

export function Spinner({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={cx('animate-spin', className)}
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

export function FullPageSpinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background text-muted-foreground">
      <Spinner size={22} className="text-primary" />
      <span className="text-[13px]">{label}…</span>
    </div>
  )
}

/* ─────────────────────────── Button ─────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white border border-primary hover:bg-[#3d3c85] disabled:bg-[#9594c4] disabled:border-[#9594c4]',
  secondary: 'bg-white text-primary border border-border hover:bg-[#faf9fe] hover:border-[#b5b1dc] disabled:text-[#9b98b5]',
  ghost: 'bg-transparent text-primary border border-transparent hover:bg-muted disabled:text-[#9b98b5]',
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  loading?: boolean
  block?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function Button({
  variant = 'primary',
  loading = false,
  block = false,
  size = 'md',
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-[9px] text-[13px]', lg: 'px-4 py-[11px] text-sm' }
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cx(
        'relative inline-flex items-center justify-center gap-2 rounded-[4px] font-semibold transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
        'disabled:cursor-not-allowed cursor-pointer',
        BUTTON_VARIANTS[variant],
        sizes[size],
        block && 'w-full',
        className,
      )}
      {...rest}
    >
      {/* Content keeps its width while loading so nothing shifts. */}
      <span className={cx('inline-flex items-center justify-center gap-2', loading && 'invisible')}>{children}</span>
      {loading && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size={16} />
        </span>
      )}
    </button>
  )
}

/* ─────────────────────────── Alert ─────────────────────────── */

type AlertTone = 'error' | 'success' | 'info' | 'warning'

const ALERT_TONES: Record<AlertTone, string> = {
  error: 'border-[#f1c6d2] bg-[#fde8ee] text-[#9c3a52]',
  success: 'border-[#b9e3cf] bg-[#eef8f3] text-[#2f6b52]',
  info: 'border-border bg-background text-secondary-foreground',
  warning: 'border-[#f1d9b8] bg-[#fdf3e7] text-[#8a5518]',
}

export function Alert({
  tone = 'error',
  title,
  children,
  action,
  onDismiss,
}: {
  tone?: AlertTone
  title?: string
  children?: ReactNode
  action?: ReactNode
  onDismiss?: () => void
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cx('flex items-start gap-3 rounded-[4px] border px-3.5 py-3 text-[13px] leading-5', ALERT_TONES[tone])}
    >
      <AlertIcon tone={tone} />
      <div className="min-w-0 flex-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className={title ? 'mt-0.5' : undefined}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss"
          className="-m-1 rounded p-1 opacity-70 hover:opacity-100 focus-visible:outline-2 focus-visible:outline-current cursor-pointer"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}

function AlertIcon({ tone }: { tone: AlertTone }) {
  const common = { 'aria-hidden': true, width: 16, height: 16, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, className: 'mt-0.5 shrink-0' }
  if (tone === 'success') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12.5l2.5 2.5L16 9.5" />
      </svg>
    )
  }
  if (tone === 'info') {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 8h.01" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M12 3l9.5 17h-19L12 3z" />
      <path d="M12 10v4M12 17h.01" />
    </svg>
  )
}

/* ─────────────────────────── Form fields ─────────────────────────── */

export const inputClass = cx(
  'w-full rounded-[4px] border border-border bg-white px-3 py-[9px] text-sm text-foreground',
  'placeholder:text-[#9b98b5] outline-none transition-[border-color,box-shadow]',
  'focus:border-primary focus:shadow-[0_0_0_3px_rgba(75,74,158,0.16)]',
  'aria-[invalid=true]:border-[#c4506a] aria-[invalid=true]:focus:shadow-[0_0_0_3px_rgba(196,80,106,0.16)]',
  'disabled:bg-background disabled:text-[#7d7a99]',
)

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  ref?: Ref<HTMLInputElement>
  label: string
  error?: string | null
  hint?: ReactNode
  labelAside?: ReactNode
  trailing?: ReactNode
}

export function TextField({ label, error, hint, labelAside, trailing, id, className, ...rest }: TextFieldProps) {
  const autoId = useId()
  const inputId = id ?? autoId
  const hintId = hint ? `${inputId}-hint` : undefined
  const errorId = error ? `${inputId}-error` : undefined
  return (
    <div className={cx('mb-4', className)}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <label htmlFor={inputId} className="block text-xs font-semibold uppercase tracking-[0.05em] text-secondary-foreground">
          {label}
        </label>
        {labelAside}
      </div>
      <div className="relative">
        <input
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(' ') || undefined}
          className={cx(inputClass, trailing ? 'pr-11' : undefined)}
          {...rest}
        />
        {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1.5">{trailing}</div>}
      </div>
      {error && (
        <p id={errorId} className="mt-1.5 text-xs text-[#c4506a]">
          {error}
        </p>
      )}
      {hint && (
        <div id={hintId} className="mt-1.5 text-xs text-muted-foreground">
          {hint}
        </div>
      )}
    </div>
  )
}

export function PasswordField(props: Omit<TextFieldProps, 'type' | 'trailing'>) {
  const [visible, setVisible] = useState(false)
  return (
    <TextField
      {...props}
      type={visible ? 'text' : 'password'}
      spellCheck={false}
      autoCapitalize="off"
      trailing={
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="rounded-[3px] p-1.5 text-muted-foreground hover:text-primary focus-visible:outline-2 focus-visible:outline-primary cursor-pointer"
        >
          {visible ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      }
    />
  )
}

function EyeIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M10.6 5.1A10.4 10.4 0 0 1 12 5c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.1M6.6 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.8 9.8 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </svg>
  )
}

/** Live checklist shown under new-password inputs. Always rendered, so it never shifts the layout. */
export function PasswordChecklist({ password, id }: { password: string; id?: string }) {
  return (
    <ul id={id} aria-label="Password requirements" className="grid grid-cols-2 gap-x-4 gap-y-1">
      {PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return (
          <li key={rule.id} className={cx('flex items-center gap-1.5 text-xs transition-colors', met ? 'text-[#3f8a6a]' : 'text-[#7d7a99]')}>
            <svg aria-hidden="true" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              {met ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <circle cx="12" cy="12" r="3.5" />}
            </svg>
            <span>
              {rule.label}
              <span className="sr-only">{met ? ' (met)' : ' (not met)'}</span>
            </span>
          </li>
        )
      })}
    </ul>
  )
}

/* ─────────────────────────── Data states ─────────────────────────── */

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div aria-hidden="true" className={cx('animate-pulse rounded-[4px] bg-muted', className)} style={style} />
}

export function ErrorState({
  title = "We couldn't load this",
  message,
  onRetry,
  retrying,
  compact,
}: {
  title?: string
  message: string
  onRetry?: () => void
  retrying?: boolean
  compact?: boolean
}) {
  return (
    <div role="alert" className={cx('flex flex-col items-center text-center', compact ? 'py-6' : 'py-12')}>
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-full bg-[#fde8ee] text-[#c4506a]">
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M12 8v5M12 16h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      </div>
      <div className="text-sm font-semibold text-foreground">{title}</div>
      <div className="mt-1 max-w-sm text-[13px] text-muted-foreground">{message}</div>
      {onRetry && (
        <Button variant="secondary" size="sm" className="mt-4" onClick={onRetry} loading={retrying}>
          Try again
        </Button>
      )}
    </div>
  )
}
