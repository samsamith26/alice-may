import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { DeleteSiteButton } from '@/components/map/DeleteSiteButton'
import { Annotation, Card, EmptyState, Readout } from '@/components/ui/primitives'

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await requireMembership()
  const supabase = await createClient()

  const { data: site } = await supabase
    .from('points_of_interest')
    .select('id, name, category, lat, lng, depth_ft, notes')
    .eq('id', id)
    .maybeSingle()

  if (!site) notFound()

  const { data: visits } = await supabase
    .from('trip_sites')
    .select('trips(id, trip_date)')
    .eq('site_id', id)

  const trips = (visits ?? [])
    .map((row) => row.trips)
    .filter((trip): trip is { id: string; trip_date: string } => trip !== null)
    .sort((a, b) => b.trip_date.localeCompare(a.trip_date))

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Annotation>{site.category}</Annotation>
          <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
          <p className="mt-1 text-sm text-hull-700/70 dark:text-chart-200/60">
            {trips.length === 0
              ? 'No logged visits yet'
              : `${trips.length} visit${trips.length === 1 ? '' : 's'}, last ${longDate(
                  trips[0].trip_date,
                )}`}
          </p>
        </div>
        {membership.role === 'crew' ? <DeleteSiteButton siteId={site.id} /> : null}
      </div>

      <Card className="flex flex-col gap-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
          <div>
            <dt className="annotation opacity-60">Latitude</dt>
            <dd><Readout value={site.lat.toFixed(5)} /></dd>
          </div>
          <div>
            <dt className="annotation opacity-60">Longitude</dt>
            <dd><Readout value={site.lng.toFixed(5)} /></dd>
          </div>
          <div>
            <dt className="annotation opacity-60">Depth</dt>
            <dd>
              <Readout
                value={site.depth_ft === null ? '—' : String(site.depth_ft)}
                unit={site.depth_ft === null ? undefined : 'ft'}
              />
            </dd>
          </div>
        </dl>
        {site.notes ? (
          <p className="whitespace-pre-wrap border-t border-chart-300/60 pt-3 text-sm leading-relaxed dark:border-hull-700/60">
            {site.notes}
          </p>
        ) : null}
      </Card>

      <div>
        <Annotation>Trips here</Annotation>
        {trips.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {trips.map((trip) => (
              <li key={trip.id}>
                <Link href={`/trips/${trip.id}`}>
                  <Card className="transition-colors hover:border-magenta-500/50">
                    {longDate(trip.trip_date)}
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            <EmptyState title="No trips tagged with this site">
              <p>Tag it when logging a trip and the visits collect here.</p>
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
