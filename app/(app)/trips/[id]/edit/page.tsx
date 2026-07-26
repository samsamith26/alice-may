import { notFound } from 'next/navigation'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { getCrewOptions, getSiteOptions } from '@/lib/db/queries'
import { TripForm, type TripFormValues } from '@/components/trips/TripForm'

export default async function EditTripPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await requireCrew()
  const supabase = await createClient()

  const [{ data: trip }, crewOptions, siteOptions] = await Promise.all([
    supabase
      .from('trips')
      .select(
        'id, trip_date, departure_time, return_time, engine_hours_start, engine_hours_end, fuel_level_start_gal, fuel_added_gal, fuel_level_end_gal, fuel_price_per_gal, distance_nm, start_lat, start_lng, end_lat, end_lng, notes, trip_passengers(crew_id), trip_sites(site_id)',
      )
      .eq('id', id)
      .maybeSingle(),
    getCrewOptions(membership.boatId),
    getSiteOptions(membership.boatId),
  ])

  if (!trip) notFound()

  const values: TripFormValues = Object.fromEntries(
    Object.entries(trip)
      .filter(([key]) => key !== 'trip_passengers' && key !== 'trip_sites')
      .map(([key, value]) => [key, value === null ? '' : String(value)]),
  )

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Edit trip</h1>
      <TripForm
        values={values}
        crewOptions={crewOptions}
        siteOptions={siteOptions}
        selectedCrewIds={trip.trip_passengers.map((row) => row.crew_id)}
        selectedSiteIds={trip.trip_sites.map((row) => row.site_id)}
        draftKey={`trip-${id}`}
      />
    </div>
  )
}
