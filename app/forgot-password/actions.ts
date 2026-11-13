'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import type { AuthFormState } from '@/lib/auth/form-state'
import { fieldErrors, forgotPasswordSchema } from '@/lib/validation/schemas'

/**
 * Send a link to set or reset a password. This is also how everyone who
 * signed in with magic links before passwords existed gets one: their
 * account is already there, it simply has no password yet.
 *
 * The reply is the same whatever the address is — unknown, unapproved, or
 * real — so the form cannot be used to find out who has an account.
 */
export async function requestPasswordLink(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
  const parsed = forgotPasswordSchema.safeParse({ email })
  if (!parsed.success) {
    return { status: 'error', fields: fieldErrors(parsed.error), email }
  }

  const origin = (await headers()).get('origin')
  if (!origin) {
    return { status: 'error', message: 'Could not determine the site address.', email }
  }

  const supabase = await createClient()
  // The "Reset password" template builds its link from this and adds
  // type=recovery&next=/auth/update-password itself.
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${origin}/auth/confirm`,
  })

  // A rate limit is about the person asking, not the address, so saying so
  // gives nothing away and stops them waiting on an email that is not coming.
  if (error?.status === 429) {
    return {
      status: 'error',
      message: 'Too many emails sent recently. Wait a little while and try again.',
      email: parsed.data.email,
    }
  }

  return {
    status: 'sent',
    message: `If that address is approved, we’ve sent a link to ${parsed.data.email}. It expires in an hour.`,
  }
}
