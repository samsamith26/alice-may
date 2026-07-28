import type { ComponentProps, ReactNode } from 'react'

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/* -------------------------------------------------------------- surfaces -- */

export function Card({
  children,
  className,
  ...rest
}: ComponentProps<'section'>) {
  return (
    <section
      {...rest}
      className={cx(
        'rounded-lg border border-chart-300/70 bg-white/70 p-4',
        'dark:border-hull-700/60 dark:bg-hull-900/60',
        className,
      )}
    >
      {children}
    </section>
  )
}

/**
 * A chart annotation: how a nautical chart labels a feature. Used for field
 * labels and section eyebrows rather than ordinary headings.
 */
export function Annotation({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <span
      className={cx(
        'annotation text-hull-700/80 dark:text-chart-200/70',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A measured value. Always mono and tabular so columns align. */
export function Readout({
  value,
  unit,
  className,
}: {
  value: ReactNode
  unit?: string
  className?: string
}) {
  return (
    <span className={cx('readout', className)}>
      {value}
      {unit ? (
        <span className="ml-1 text-[0.75em] opacity-70">{unit}</span>
      ) : null}
    </span>
  )
}

export function StatTile({
  label,
  value,
  unit,
  sub,
}: {
  label: string
  value: ReactNode
  unit?: string
  sub?: string
}) {
  return (
    <Card className="flex flex-col gap-1">
      <Annotation>{label}</Annotation>
      <Readout value={value} unit={unit} className="text-2xl font-medium" />
      {sub ? (
        <span className="text-xs text-hull-700/70 dark:text-chart-200/60">
          {sub}
        </span>
      ) : null}
    </Card>
  )
}

/* --------------------------------------------------------------- status -- */

export type Tone = 'ok' | 'soon' | 'overdue' | 'neutral'

const PILL_TONES: Record<Tone, string> = {
  ok: 'bg-ok-500/12 text-ok-600 dark:text-ok-500',
  soon: 'bg-magenta-500/12 text-magenta-600 dark:text-magenta-400',
  overdue: 'bg-alarm-500/15 text-alarm-600 dark:text-alarm-500',
  neutral: 'bg-hull-800/10 text-hull-800 dark:bg-chart-100/10 dark:text-chart-200',
}

export function Pill({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={cx(
        'annotation inline-flex items-center rounded-full px-2 py-1',
        PILL_TONES[tone],
      )}
    >
      {children}
    </span>
  )
}

const BANNER_TONES: Record<Tone, string> = {
  ok: 'border-ok-500/40 bg-ok-500/10',
  soon: 'border-magenta-500/40 bg-magenta-500/10',
  overdue: 'border-alarm-500/50 bg-alarm-500/12',
  neutral: 'border-chart-300 bg-chart-100/60 dark:border-hull-700 dark:bg-hull-900/60',
}

export function Banner({
  tone = 'neutral',
  children,
}: {
  tone?: Tone
  children: ReactNode
}) {
  return (
    <div className={cx('rounded-lg border px-4 py-3 text-sm', BANNER_TONES[tone])}>
      {children}
    </div>
  )
}

/* --------------------------------------------------------------- inputs -- */

const BUTTON_BASE =
  'inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50'

const BUTTON_VARIANTS = {
  // Chart magenta: on a real chart this ink means navigational significance.
  primary: 'bg-magenta-500 text-white hover:bg-magenta-600',
  secondary:
    'border border-hull-800/25 text-hull-900 hover:bg-hull-800/8 dark:border-chart-200/25 dark:text-chart-100 dark:hover:bg-chart-100/8',
  danger: 'bg-alarm-500 text-white hover:bg-alarm-600',
} as const

export function Button({
  variant = 'primary',
  className,
  ...rest
}: ComponentProps<'button'> & { variant?: keyof typeof BUTTON_VARIANTS }) {
  return (
    <button
      {...rest}
      className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)}
    />
  )
}

/** Shared so anything that has to sit in a field row matches a real input. */
export const CONTROL =
  'min-h-12 w-full rounded-md border border-hull-800/25 bg-white px-3 text-lg text-hull-950 placeholder:text-hull-700/40 dark:border-chart-200/20 dark:bg-hull-900 dark:text-chart-100'

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <Annotation>{label}</Annotation>
      {children}
      {hint && !error ? (
        <span className="text-xs text-hull-700/70 dark:text-chart-200/60">{hint}</span>
      ) : null}
      {error ? (
        <span className="text-xs font-medium text-alarm-600 dark:text-alarm-500">
          {error}
        </span>
      ) : null}
    </label>
  )
}

export function TextInput({ className, ...rest }: ComponentProps<'input'>) {
  return <input {...rest} className={cx(CONTROL, className)} />
}

/** Numeric entry. inputMode gives phones a number pad instead of a keyboard. */
export function NumberInput({ className, ...rest }: ComponentProps<'input'>) {
  return (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      className={cx(CONTROL, 'readout', className)}
    />
  )
}

export function Select({ className, ...rest }: ComponentProps<'select'>) {
  return <select {...rest} className={cx(CONTROL, className)} />
}

export function Textarea({ className, ...rest }: ComponentProps<'textarea'>) {
  return (
    <textarea
      {...rest}
      className={cx(CONTROL, 'min-h-28 resize-y py-2 text-base', className)}
    />
  )
}

/* ---------------------------------------------------------------- empty -- */

export function EmptyState({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="rounded-lg border border-dashed border-chart-300 px-6 py-10 text-center dark:border-hull-700">
      <p className="font-semibold">{title}</p>
      {children ? (
        <div className="mt-2 text-sm text-hull-700/80 dark:text-chart-200/70">
          {children}
        </div>
      ) : null}
    </div>
  )
}
