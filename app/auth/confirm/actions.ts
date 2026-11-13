'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  asOtpType,
  destinationAfterLink,
  isRecoverySession,
  linkFailurePath,
  linkPurpose,
} from '@/lib/auth/links'

/**
 * Spend an emailed token: confirming a new account, or a password reset.
 *
 * Deliberately a POST from a button the person actually presses. Tokens are
 * single use, and mail providers and corporate scanners routinely fetch every
 * link in a message before it is ever opened — Outlook's Safe Links among
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
 *   exchange only stops us adding a second way to lose it. Kept so signup and
 *   reset keep working if a template is ever reset to the default.
 */
export async function confirmLink(formData: FormData): Promise<void> {
  const next = String(formData.get('next') ?? '/')
  const tokenHash = String(formData.get('token_hash') ?? '')
  const code = String(formData.get('code') ?? '')
  const type = asOtpType(formData.get('type'))
  const purpose = linkPurpose(type)

  const supabase = await createClient()

  if (tokenHash) {
    if (!type) redirect(linkFailurePath(purpose, 'missing'))
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (error) redirect(linkFailurePath(purpose, 'expired'))
    redirect(destinationAfterLink(next, purpose === 'recovery'))
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) redirect(linkFailurePath(purpose, 'expired'))
    // A ?code= link carries no type, so ask the new session how it began.
    const { data } = await supabase.auth.getClaims()
    const recovery = purpose === 'recovery' || isRecoverySession(data?.claims.amr)
    redirect(destinationAfterLink(next, recovery))
  }

  redirect(linkFailurePath(purpose, 'missing'))
}
