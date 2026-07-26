import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Magic links land here. @supabase/ssr defaults to the PKCE flow, so the link
 * carries a `code` to exchange for a session — not a `token_hash`, which would
 * need a customised email template this project's plan cannot provide.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=link_expired`)
  }

  // Only ever redirect within this app; an attacker-supplied `next` must not
  // be able to bounce a freshly authenticated user off-site.
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/'
  return NextResponse.redirect(`${origin}${safeNext}`)
}
