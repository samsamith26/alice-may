import Link from 'next/link'
import { Annotation, Button } from '@/components/ui/primitives'
import { confirmSignIn } from './actions'

/**
 * Where a sign-in link lands.
 *
 * This page verifies nothing. It reads the token out of the URL, puts it in a
 * form, and waits. Only pressing the button spends it.
 *
 * That waiting is the entire point. A sign-in token works once, and plenty of
 * things fetch a link before its recipient ever sees it — mail clients building
 * previews, and company scanners checking where links go. Verifying on page
 * load meant whichever of those got there first used the token up, and the
 * person who asked for it was told their link had expired.
 */
export default async function ConfirmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const first = (key: string) => {
    const value = params[key]
    return Array.isArray(value) ? value[0] : value
  }

  const tokenHash = first('token_hash') ?? ''
  const code = first('code') ?? ''
  const type = first('type') ?? 'magiclink'
  const next = first('next') ?? '/'
  const hasToken = tokenHash !== '' || code !== ''

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-hull-950 px-6 py-16 text-chart-100">
      <div className="mx-auto w-full max-w-sm">
        <Annotation className="text-shoal-300">Monterey Harbor</Annotation>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Alice May</h1>

        {hasToken ? (
          <>
            <p className="mt-3 text-sm text-chart-200/70">
              One more tap and you&rsquo;re in. This is here so that nothing but
              you can use the link — some mail apps and company filters open
              every link in a message before you do.
            </p>

            <form action={confirmSignIn} className="mt-8">
              <input type="hidden" name="token_hash" value={tokenHash} />
              <input type="hidden" name="code" value={code} />
              <input type="hidden" name="type" value={type} />
              <input type="hidden" name="next" value={next} />
              <Button type="submit" className="w-full">
                Confirm sign-in
              </Button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-chart-200/70">
              This link is missing the part that proves it came from your email.
              Ask for a fresh one and open it straight from the message.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-flex min-h-12 items-center rounded-md bg-magenta-500 px-4 text-sm font-semibold text-white hover:bg-magenta-600"
            >
              Send a new link
            </Link>
          </>
        )}
      </div>
    </main>
  )
}
