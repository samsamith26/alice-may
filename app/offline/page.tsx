export const metadata = { title: 'Offline — Alice May Logbook' }

export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-hull-950 px-6 py-16 text-chart-100">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">No signal</h1>
        <p className="mt-3 text-sm text-chart-200/75">
          This page needs a connection. Anything you typed into a trip form is
          saved on this phone and will upload on its own once you&rsquo;re back
          in range.
        </p>
      </div>
    </main>
  )
}
