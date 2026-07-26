import Link from 'next/link'
import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { Annotation, Card, EmptyState, Readout } from '@/components/ui/primitives'
import { formatDistance, formatGallons, formatHours } from '@/lib/format/units'
import type { ConditionsSnapshot } from '@/lib/conditions/types'

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function TripsPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const { data: trips } = await supabase
    .from('trips')
    .select(
      'id, trip_date, hours_run, distance_nm, fuel_used_gal, conditions_snapshot',
    )
    .eq('boat_id', membership.boatId)
    .order('trip_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (!trips || trips.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
        <EmptyState title="No trips logged yet">
          {membership.role === 'crew' ? (
            <p>
              <Link href="/trips/new" className="font-semibold text-magenta-600 underline dark:text-magenta-400">
                Log the first one
              </Link>{' '}
              — conditions get attached automatically.
            </p>
          ) : (
            <p>Trips will appear here once the crew logs them.</p>
          )}
        </EmptyState>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Trips</h1>
        <Annotation>{trips.length} logged</Annotation>
      </div>

      <ul className="flex flex-col gap-3">
        {trips.map((trip) => {
          const snapshot = trip.conditions_snapshot as ConditionsSnapshot | null
          return (
            <li key={trip.id}>
              <Link href={`/trips/${trip.id}`} className="block">
                <Card className="transition-colors hover:border-magenta-500/50">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-semibold">{longDate(trip.trip_date)}</span>
                    {snapshot?.summary ? (
                      <span className="readout text-xs text-hull-700/70 dark:text-chart-200/60">
                        {snapshot.summary}
                      </span>
                    ) : null}
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    <div>
                      <dt className="annotation text-hull-700/70 dark:text-chart-200/60">
                        Hours
                      </dt>
                      <dd>
                        <Readout value={formatHours(trip.hours_run)} />
                      </dd>
                    </div>
                    <div>
                      <dt className="annotation text-hull-700/70 dark:text-chart-200/60">
                        Distance
                      </dt>
                      <dd>
                        <Readout value={formatDistance(trip.distance_nm)} unit="nm" />
                      </dd>
                    </div>
                    <div>
                      <dt className="annotation text-hull-700/70 dark:text-chart-200/60">
                        Fuel
                      </dt>
                      <dd>
                        <Readout value={formatGallons(trip.fuel_used_gal)} unit="gal" />
                      </dd>
                    </div>
                  </dl>
                </Card>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
