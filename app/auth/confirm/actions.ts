'use server'

import { redirect } from 'next/navigation'
import type { EmailOtpType } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

/**
 * The only types a sign-in email can legitimately carry. `type` arrives from a
 * query string, so it is checked against this rather than cast.
 */
const EMAIL_OTP_TYPES = [
  'magiclink',
  'signup',
  'invite',
  'recovery',
  'email_change',
  'email',
] as const satisfies readonly EmailOtpType[]

function asOtpType(value: string): EmailOtpType | null {
  return (EMAIL_OTP_TYPES as readonly string[]).includes(value)
    ? (value as EmailOtpType)
    : null
}

/** Only ever bounce a freshly signed-in user somewhere inside this app. */
function safeNext(value: string): string {
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

/**
 * Spend the sign-in token and start the session.
 *
 * Deliberately a POST from a button the person actually presses. Sign-in tokens
 * are single use, and mail providers and corporate scanners routinely fetch
 * every link in a message before it is ever opened — Outlook's Safe Links among
 * them. Whatever fetched the link first spent the token, and the person who
 * asked for it arrived second and was told it had expired.
 *
 * Two shapes of link are accepted, because which one arrives depends on the
 * email template:
 *
 *   token_hash — the template points here directly, and this is the shape that
 *   actually solves the problem: nothing reaches Supabase until the button is
 *   pressed, so there is nothing for a scanner to spend.
 *
 *   code — Supabase's default template sends people through its own verify
 *   endpoint first, which redirects here having already spent the token. A
 *   scanner still breaks that link before anyone sees it; deferring the
 *   exchange only stops us adding a second way to lose it. Kept so sign-in
 *   keeps working on the default template.
 */
export async function confirmSignIn(formData: FormData): Promise<void> {
  const next = safeNext(String(formData.get('next') ?? '/'))
  const tokenHash = String(formData.get('token_hash') ?? '')
  const code = String(formData.get('code') ?? '')

  const supabase = await createClient()

  if (tokenHash) {
    const type = asOtpType(String(formData.get('type') ?? ''))
    if (!type) redirect('/login?error=missing_token')

    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    })
    if (error) redirect('/login?error=link_expired')
    redirect(next)
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) redirect('/login?error=link_expired')
    redirect(next)
  }

  redirect('/login?error=missing_token')
}
