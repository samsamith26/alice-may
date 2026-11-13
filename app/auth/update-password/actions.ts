'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { AuthFormState } from '@/lib/auth/form-state'
import { fieldErrors, updatePasswordSchema } from '@/lib/validation/schemas'

export async function updatePassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const parsed = updatePasswordSchema.safeParse({
    password: formData.get('password'),
    confirm_password: formData.get('confirm_password'),
  })
  if (!parsed.success) {
    return { status: 'error', fields: fieldErrors(parsed.error) }
  }

  const supabase = await createClient()

  // The page checked for a session, but it may have lapsed while the form
  // sat open. updateUser would fail anyway; this says why.
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims) redirect('/forgot-password?error=session_missing')

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password })

  if (error) {
    if (error.code === 'same_password') {
      return { status: 'error', fields: { password: 'That’s already your password. Choose a new one.' } }
    }
    if (error.code === 'weak_password') {
      return { status: 'error', fields: { password: error.message } }
    }
    if (error.code === 'reauthentication_needed' || error.status === 401) {
      redirect('/forgot-password?error=session_missing')
    }
    return { status: 'error', message: 'Couldn’t save the password. Try again in a moment.' }
  }

  redirect('/')
}
