import Link from 'next/link'
import { Button } from '@/components/ui/primitives'
import { AuthShell } from '@/components/auth/AuthShell'
import { asOtpType, linkPurpose, type LinkPurpose } from '@/lib/auth/links'
import { confirmLink } from './actions'

/**
 * Where every emailed link lands: account confirmation and password reset.
 *
 * This page verifies nothing. It reads the token out of the URL, puts it in a
 * form, and waits. Only pressing the button spends it.
 *
 * That waiting is the entire point. A token works once, and plenty of things
 * fetch a link before its recipient ever sees it — mail clients building
 * previews, and company scanners checking where links go. Verifying on page
 * load meant whichever of those got there first used the token up, and the
 * person who asked for it was told their link had expired.
 */

const COPY: Record<LinkPurpose, { heading: string; body: string; button: string }> = {
  signup: {
    heading: 'Confirm your email',
    body: 'One more tap and your account is ready.',
    button: 'Confirm email',
  },
  recovery: {
    heading: 'Set your password',
    body: 'Tap below, then choose a password.',
    button: 'Continue',
  },
  other: {
    heading: 'Alice May',
    body: 'One more tap and you’re in.',
    button: 'Confirm sign-in',
  },
}

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
  const rawType = first('type') ?? ''
  const purpose = linkPurpose(asOtpType(rawType))
  const next = first('next') ?? '/'
  const hasToken = tokenHash !== '' || code !== ''
  const copy = COPY[purpose]

  if (!hasToken) {
    return (
      <AuthShell intro="This link is missing the part that proves it came from your email. Open it straight from the message, or ask for a fresh one.">
        <Link
          href={purpose === 'recovery' ? '/forgot-password' : '/login'}
          className="inline-flex min-h-12 items-center rounded-md bg-magenta-500 px-4 text-sm font-semibold text-white hover:bg-magenta-600"
        >
          {purpose === 'recovery' ? 'Send a new link' : 'Go to sign in'}
        </Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      heading={copy.heading}
      intro={`${copy.body} This step is here so nothing but you can use the link — some mail apps and company filters open every link in a message before you do.`}
    >
      <form action={confirmLink}>
        <input type="hidden" name="token_hash" value={tokenHash} />
        <input type="hidden" name="code" value={code} />
        <input type="hidden" name="type" value={rawType} />
        <input type="hidden" name="next" value={next} />
        <Button type="submit" className="w-full">
          {copy.button}
        </Button>
      </form>
    </AuthShell>
  )
}
