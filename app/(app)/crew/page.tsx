import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { CrewManager } from '@/components/access/CrewManager'
import { Card, EmptyState } from '@/components/ui/primitives'

export default async function CrewPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const { data: crew } = await supabase
    .from('crew')
    .select('id, name, emergency_contact_name, emergency_contact_phone')
    .eq('boat_id', membership.boatId)
    .order('name')

  const rows = crew ?? []
  const isCrew = membership.role === 'crew'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Crew roster</h1>
        <p className="mt-1 text-sm text-hull-700/75 dark:text-chart-200/65">
          People who come out on the boat. Separate from who can sign in — these
          are the names on trips and float plans, with the numbers to call if
          something goes wrong.
        </p>
      </div>

      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((person) => (
            <li key={person.id}>
              <Card className="flex flex-col gap-1">
                <p className="font-medium">{person.name}</p>
                {person.emergency_contact_name || person.emergency_contact_phone ? (
                  <p className="text-sm opacity-75">
                    In an emergency: {person.emergency_contact_name ?? '—'}
                    {person.emergency_contact_phone
                      ? ` · ${person.emergency_contact_phone}`
                      : ''}
                  </p>
                ) : (
                  <p className="text-sm opacity-55">No emergency contact recorded.</p>
                )}
                {isCrew ? <CrewManager mode="row" person={person} /> : null}
              </Card>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nobody on the roster yet">
          <p>Add whoever comes out with you so float plans have their contacts.</p>
        </EmptyState>
      )}

      {isCrew ? <CrewManager mode="form" /> : null}
    </div>
  )
}
