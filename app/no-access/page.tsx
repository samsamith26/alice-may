import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/primitives'

export default async function NoAccessPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <main className="flex min-h-dvh flex-col justify-center bg-hull-950 px-6 py-16 text-chart-100">
      <div className="mx-auto w-full max-w-sm">
        <h1 className="text-3xl font-semibold tracking-tight">
          You&rsquo;re not on the crew list
        </h1>
        <p className="mt-4 text-sm text-chart-200/80">
          {user.email} isn&rsquo;t set up for this logbook yet. Ask Sam to add
          it, then sign in again with the same address.
        </p>

        <form action="/auth/signout" method="post" className="mt-8">
          <Button type="submit" variant="secondary">
            Sign out
          </Button>
        </form>
      </div>
    </main>
  )
}
