import { NextResponse, type NextRequest } from 'next/server'

/**
 * Where sign-in links used to land, kept only for links already sitting in
 * somebody's inbox. New ones go to /auth/confirm, which waits for a button
 * press rather than signing you in the instant the URL is fetched.
 *
 * This hands over rather than exchanging the code itself: anything that fetches
 * a link before its recipient opens it — a mail client building a preview, a
 * company scanner checking where it goes — would otherwise spend the code here
 * and leave the person who asked for it staring at an expired link.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  // Only ever redirect within this app; an attacker-supplied `next` must not
  // be able to bounce a freshly authenticated user off-site.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'

  const handover = new URL('/auth/confirm', origin)
  handover.searchParams.set('code', code)
  handover.searchParams.set('next', safeNext)
  return NextResponse.redirect(handover)
}
