'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AuthFormState } from '@/lib/auth/form-state'
import { isNotApprovedError } from '@/lib/auth/links'
import { fieldErrors, signUpSchema } from '@/lib/validation/schemas'

/**
 * Create an account for an approved address.
 *
 * The allowlist is enforced by the before-user-created hook in the database
 * (supabase/schema.sql), which refuses to create the auth user at all. This
 * action does not repeat that lookup itself: reading allowed_emails while
 * signed out would mean either the service-role key in a request path or a
 * new anonymous RPC that answers "is this address approved?" without the rate
 * limits Supabase Auth puts on signUp. Instead it recognises the hook's
 * refusal and turns it into readable copy.
 *
 * "Confirm email" stays on, so the account is unusable until someone proves
 * they own the inbox; claiming an approved address that is not yours gets
 * you nothing.
 */
export async function signUp(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
  const parsed = signUpSchema.safeParse({
    email,
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  })
  if (!parsed.success) {
    return { status: 'error', fields: fieldErrors(parsed.error), email }
  }

  const origin = (await headers()).get('origin')
  if (!origin) {
    return { status: 'error', message: 'Could not determine the site address.', email }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    // The confirm email builds its link from this, landing on the page that
    // waits for a button press. Taken from the request so a signup on
    // localhost confirms on localhost.
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  })

  if (error) {
    if (isNotApprovedError(error)) {
      return {
        status: 'error',
        message:
          'That address isn’t on the crew list. Ask Sam to add it on the Access page, then try again.',
        email: parsed.data.email,
      }
    }
    if (error.code === 'weak_password') {
      return { status: 'error', fields: { password: error.message }, email: parsed.data.email }
    }
    if (error.status === 429) {
      return {
        status: 'error',
        message: 'Too many emails sent recently. Wait a little while and try again.',
        email: parsed.data.email,
      }
    }
    return {
      status: 'error',
      message: 'Couldn’t create the account just now. Try again in a moment.',
      email: parsed.data.email,
    }
  }

  // Only reachable if "Confirm email" has been switched off in the dashboard.
  if (data.session) redirect('/')

  return {
    status: 'sent',
    message: `Check ${parsed.data.email} for a link to confirm the address. If nothing arrives and you’ve used the logbook before, you already have an account — set a password instead.`,
  }
}
