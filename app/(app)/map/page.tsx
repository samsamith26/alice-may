import Link from 'next/link'
import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { getBoat } from '@/lib/db/queries'
import { MapWorkspace } from '@/components/map/MapWorkspace'
import type { MapMarker } from '@/components/map/MapCanvas'
import { Annotation, Card } from '@/components/ui/primitives'

export default async function MapPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [boat, { data: sites }, { data: trips }] = await Promise.all([
    getBoat(membership.boatId),
    supabase
      .from('points_of_interest')
      .select('id, name, category, lat, lng, depth_ft')
      .eq('boat_id', membership.boatId)
      .order('name'),
    supabase
      .from('trips')
      .select('id, trip_date, start_lat, start_lng')
      .eq('boat_id', membership.boatId)
      .not('start_lat', 'is', null)
      .not('start_lng', 'is', null)
      .order('trip_date', { ascending: false })
      .limit(200),
  ])

  const siteMarkers: MapMarker[] = (sites ?? []).map((site) => ({
    id: site.id,
    lat: site.lat,
    lng: site.lng,
    label: site.name,
    category: site.category,
    kind: 'site',
    href: `/sites/${site.id}`,
  }))

  const tripMarkers: MapMarker[] = (trips ?? []).map((trip) => ({
    id: trip.id,
    lat: trip.start_lat as number,
    lng: trip.start_lng as number,
    label: trip.trip_date,
    category: 'trip',
    kind: 'trip',
    href: `/trips/${trip.id}`,
  }))

  const center: [number, number] = [boat?.home_lat ?? 36.6045, boat?.home_lng ?? -121.8918]

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Map</h1>
        <Annotation>
          {siteMarkers.length} site{siteMarkers.length === 1 ? '' : 's'} saved
        </Annotation>
      </div>

      <MapWorkspace
        center={center}
        siteMarkers={siteMarkers}
        tripMarkers={tripMarkers}
        canEdit={membership.role === 'crew'}
      />

      {siteMarkers.length > 0 ? (
        <Card className="flex flex-col gap-3">
          <Annotation>Saved sites</Annotation>
          <ul className="grid gap-2 sm:grid-cols-2">
            {(sites ?? []).map((site) => (
              <li key={site.id}>
                <Link
                  href={`/sites/${site.id}`}
                  className="flex items-baseline justify-between gap-3 rounded-md px-2 py-2 hover:bg-hull-800/6 dark:hover:bg-chart-100/6"
                >
                  <span>
                    <span className="font-medium">{site.name}</span>{' '}
                    <span className="annotation opacity-60">{site.category}</span>
                  </span>
                  {site.depth_ft !== null ? (
                    <span className="readout text-sm opacity-70">
                      {site.depth_ft} ft
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <p className="text-xs text-hull-700/60 dark:text-chart-200/50">
        Base map &copy; OpenStreetMap contributors. Seamarks &copy; OpenSeaMap
        contributors.
      </p>
    </div>
  )
}
