'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { buildSnapshot } from '@/lib/conditions/snapshot'
import { tripSchema } from '@/lib/validation/schemas'

export type TripFormState =
  | { status: 'idle' }
  | { status: 'error'; message?: string; fieldErrors?: Record<string, string[]> }

/**
 * Fetch conditions for a saved trip and attach them.
 *
 * Deliberately swallows every failure: the trip is already committed, and a
 * weather service being down is not a reason to lose a logbook entry. The
 * outcome is recorded in conditions_status so the UI can offer a retry.
 */
async function attachConditions(tripId: string): Promise<void> {
  const supabase = await createClient()

  try {
    const { data: trip } = await supabase
      .from('trips')
      .select(
        'trip_date, departure_time, start_lat, start_lng, boats(home_lat, home_lng, tide_station_id)',
      )
      .eq('id', tripId)
      .single()

    if (!trip) return

    const boat = trip.boats as unknown as {
      home_lat: number | null
      home_lng: number | null
      tide_station_id: string | null
    } | null

    const lat = trip.start_lat ?? boat?.home_lat
    const lng = trip.start_lng ?? boat?.home_lng
    const station = boat?.tide_station_id

    if (lat === null || lat === undefined || lng === null || lng === undefined || !station) {
      await supabase
        .from('trips')
        .update({ conditions_status: 'failed', conditions_fetched_at: new Date().toISOString() })
        .eq('id', tripId)
      return
    }

    const { snapshot, status } = await buildSnapshot({
      date: trip.trip_date,
      time: trip.departure_time,
      lat,
      lng,
      tideStationId: station,
    })

    await supabase
      .from('trips')
      .update({
        conditions_snapshot: snapshot as never,
        conditions_status: status,
        conditions_fetched_at: new Date().toISOString(),
      })
      .eq('id', tripId)
  } catch {
    await supabase
      .from('trips')
      .update({
        conditions_status: 'failed',
        conditions_fetched_at: new Date().toISOString(),
      })
      .eq('id', tripId)
  }
}

export async function saveTrip(
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const membership = await requireCrew()

  const parsed = tripSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const flattened = z_flatten(parsed.error)
    return { status: 'error', fieldErrors: flattened }
  }

  const supabase = await createClient()
  const { id, ...values } = parsed.data

  // The trip is written and committed first; conditions attach afterwards.
  // If Open-Meteo is unreachable, the entry still exists.
  const { data: trip, error } = id
    ? await supabase.from('trips').update(values).eq('id', id).select('id').single()
    : await supabase
        .from('trips')
        .insert({
          ...values,
          boat_id: membership.boatId,
          created_by: membership.userId,
          conditions_status: 'pending',
        })
        .select('id')
        .single()

  if (error || !trip) {
    return { status: 'error', message: error?.message ?? 'Could not save the trip.' }
  }

  const crewIds = formData.getAll('crew_ids').map(String).filter(Boolean)
  const siteIds = formData.getAll('site_ids').map(String).filter(Boolean)

  await supabase.from('trip_passengers').delete().eq('trip_id', trip.id)
  if (crewIds.length > 0) {
    await supabase
      .from('trip_passengers')
      .insert(crewIds.map((crewId) => ({ trip_id: trip.id, crew_id: crewId })))
  }

  await supabase.from('trip_sites').delete().eq('trip_id', trip.id)
  if (siteIds.length > 0) {
    await supabase
      .from('trip_sites')
      .insert(siteIds.map((siteId) => ({ trip_id: trip.id, site_id: siteId })))
  }

  await attachConditions(trip.id)

  revalidatePath('/trips')
  revalidatePath('/')
  redirect(`/trips/${trip.id}`)
}

export async function refetchConditions(tripId: string): Promise<void> {
  await requireCrew()
  await attachConditions(tripId)
  revalidatePath(`/trips/${tripId}`)
}

export async function deleteTrip(tripId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()
  await supabase.from('trips').delete().eq('id', tripId)
  revalidatePath('/trips')
  revalidatePath('/')
  redirect('/trips')
}

/** Zod 4 renamed the flatten helper; this keeps the shape the form expects. */
function z_flatten(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>
}): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form')
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }
  return fieldErrors
}
