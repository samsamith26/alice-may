'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AuthFormState } from '@/lib/auth/form-state'
import { fieldErrors, signInSchema } from '@/lib/validation/schemas'

/**
 * One message for every failure that concerns the account itself: unknown
 * address, unapproved address, wrong password, no password set yet, email not
 * yet confirmed. Telling those apart would let anyone check which addresses
 * have accounts here.
 */
const GENERIC = 'Email or password is incorrect.'

export async function signIn(_prev: AuthFormState, formData: FormData): Promise<AuthFormState> {
  const email = String(formData.get('email') ?? '')
  const parsed = signInSchema.safeParse({ email, password: formData.get('password') })
  if (!parsed.success) {
    return { status: 'error', fields: fieldErrors(parsed.error), email }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword(parsed.data)

  if (error) {
    // Rate limiting says nothing about the account, and hiding it would leave
    // someone retrying a correct password against a lockout.
    if (error.status === 429) {
      return {
        status: 'error',
        message: 'Too many attempts. Wait a few minutes and try again.',
        email: parsed.data.email,
      }
    }
    return { status: 'error', message: GENERIC, email: parsed.data.email }
  }

  // Members land in the logbook; anyone else is routed to /no-access by the
  // membership check on the way.
  redirect('/')
}
