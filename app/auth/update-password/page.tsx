import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AuthShell } from '@/components/auth/AuthShell'
import { UpdatePasswordForm } from './UpdatePasswordForm'

/**
 * Choose a password. Reached from a reset link, which has just started a
 * session — so it needs one, and anyone without one is sent to ask for a link.
 */
export default async function UpdatePasswordPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/forgot-password?error=session_missing')

  return (
    <AuthShell heading="Choose a password" intro={`For ${user.email}. Next time, sign in with this.`}>
      <UpdatePasswordForm email={user.email ?? ''} />
    </AuthShell>
  )
}
