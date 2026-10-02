export const APP_NAME = 'NirnAIn'

function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}

/** Square "N" logo mark. `inverted` is for use on the primary-colored brand panel. */
export function BrandMark({ size = 32, inverted = false }: { size?: number; inverted?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={cx(
        'flex shrink-0 items-center justify-center rounded-lg font-bold',
        inverted ? 'bg-white/15 text-white ring-1 ring-white/25' : 'bg-primary text-primary-foreground',
      )}
      style={{ width: size, height: size, fontSize: size * 0.44 }}
    >
      N
    </div>
  )
}

/** Wordmark: Nirn<AI>n with the "AI" highlighted. */
export function BrandName({ inverted = false, className }: { inverted?: boolean; className?: string }) {
  return (
    <span className={cx('font-bold tracking-[-0.01em]', className)}>
      Nirn<span className={inverted ? 'text-[#c9c6ee]' : 'text-primary'}>AI</span>n
    </span>
  )
}
