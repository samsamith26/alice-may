import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { AccessManager } from '@/components/access/AccessManager'
import { Annotation, Card } from '@/components/ui/primitives'

export default async function AccessPage() {
  // RLS already blocks a viewer's writes; a viewer should not see the page.
  const membership = await requireCrew()
  const supabase = await createClient()

  const [{ data: allowed }, { data: members }] = await Promise.all([
    supabase
      .from('allowed_emails')
      .select('email, role, note, created_at')
      .order('created_at'),
    supabase.from('boat_members').select('user_id, role').eq('boat_id', membership.boatId),
  ])

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Crew &amp; access</h1>
        <p className="mt-1 text-sm text-hull-700/75 dark:text-chart-200/65">
          Add someone&rsquo;s email here and they can sign in with a magic link.
          Nothing else to set up.
        </p>
      </div>

      <AccessManager
        rows={(allowed ?? []).map((row) => ({
          email: row.email,
          role: row.role,
          note: row.note,
        }))}
        currentEmail={membership.email}
        signedInCount={members?.length ?? 0}
      />

      <Card className="flex flex-col gap-2">
        <Annotation>What the roles mean</Annotation>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <dt className="font-medium">Crew</dt>
          <dd className="opacity-80">
            Log and edit trips, services, sites, documents, and float plans.
          </dd>
          <dt className="font-medium">Viewer</dt>
          <dd className="opacity-80">
            Read everything — trips, stats, boat specs, float plans — and change
            nothing.
          </dd>
        </dl>
      </Card>
    </div>
  )
}
