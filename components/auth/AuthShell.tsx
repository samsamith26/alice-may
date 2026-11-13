import type { ReactNode } from 'react'
import { Annotation } from '@/components/ui/primitives'

/** The frame shared by every signed-out page: sign in, sign up, reset. */
export function AuthShell({
  heading = 'Alice May',
  intro,
  children,
}: {
  heading?: string
  intro?: ReactNode
  children: ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-hull-950 px-6 py-16 text-chart-100">
      <div className="mx-auto w-full max-w-sm">
        <Annotation className="text-shoal-300">Monterey Harbor</Annotation>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{heading}</h1>
        {intro ? <p className="mt-3 text-sm text-chart-200/70">{intro}</p> : null}
        {/* These pages are always dark, whatever the theme; field labels would
            otherwise take the light theme's dark ink and vanish. */}
        <div className="mt-8 [&_.annotation]:text-chart-200/70">{children}</div>
      </div>
    </main>
  )
}

export const linkClass = 'font-semibold text-shoal-300 underline-offset-4 hover:underline'

/** A quiet link row under a form. */
export function AuthLinks({ children }: { children: ReactNode }) {
  return (
    <div className="mt-8 flex flex-col gap-3 border-t border-chart-200/15 pt-6 text-sm text-chart-200/80">
      {children}
    </div>
  )
}

export function FormMessage({ tone, children }: { tone: 'error' | 'ok'; children: ReactNode }) {
  return (
    <p
      role={tone === 'error' ? 'alert' : 'status'}
      className={tone === 'error' ? 'text-sm text-alarm-500' : 'text-sm text-shoal-300'}
    >
      {children}
    </p>
  )
}
