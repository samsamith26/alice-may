'use server'

import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export type LoginState =
  | { status: 'idle' }
  | { status: 'sent'; message: string }
  | { status: 'error'; message: string }

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get('email') ?? '')
    .trim()
    .toLowerCase()

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { status: 'error', message: 'Enter a valid email address.' }
  }

  const origin = (await headers()).get('origin')
  if (!origin) {
    return { status: 'error', message: 'Could not determine the site address.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback` },
  })

  if (error) {
    return { status: 'error', message: error.message }
  }

  return {
    status: 'sent',
    message: `Sign-in link sent to ${email}. It expires in an hour.`,
  }
}
