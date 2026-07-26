import Link from 'next/link'
import { cookies } from 'next/headers'
import { requireMembership } from '@/lib/auth/membership'
import { NavTabs, MoreMenu } from '@/components/nav/Nav'
import { DraftSyncBanner } from '@/components/pwa/DraftSyncBanner'
import { ServiceWorkerRegistrar } from '@/components/pwa/ServiceWorkerRegistrar'
import type { Theme } from '@/app/theme/actions'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const membership = await requireMembership()
  const cookieTheme = (await cookies()).get('theme')?.value
  const theme: Theme =
    cookieTheme === 'dark' || cookieTheme === 'light' ? cookieTheme : 'system'

  return (
    <div className="flex min-h-dvh flex-col">
      <ServiceWorkerRegistrar />

      <header className="sticky top-0 z-20 border-b border-chart-300/70 bg-chart-50/90 backdrop-blur dark:border-hull-800 dark:bg-hull-950/90">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex flex-col leading-none">
            <span className="annotation text-shoal-500 dark:text-shoal-300">
              Monterey Harbor
            </span>
            <span className="text-lg font-semibold tracking-tight">Alice May</span>
          </Link>
          <MoreMenu role={membership.role} email={membership.email} theme={theme} />
        </div>
        <div className="mx-auto hidden w-full max-w-5xl px-4 pb-2 md:block">
          <NavTabs role={membership.role} />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-5 pb-28 md:pb-8">
        <div className="mb-4 empty:mb-0">
          <DraftSyncBanner />
        </div>
        {children}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-chart-300/70 bg-chart-50/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-hull-800 dark:bg-hull-950/95">
        <NavTabs role={membership.role} compact />
      </nav>
    </div>
  )
}
