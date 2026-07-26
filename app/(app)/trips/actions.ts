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

type PersistResult =
  | { ok: true; tripId: string }
  | { ok: false; message?: string; fieldErrors?: Record<string, string[]> }

/**
 * Writes a trip and returns an outcome.
 *
 * Deliberately does not redirect: the offline sync path needs to know whether
 * the write actually succeeded, and a redirect surfaces as a thrown control-flow
 * exception that is indistinguishable from a genuine failure.
 */
async function persistTrip(formData: FormData): Promise<PersistResult> {
  const membership = await requireCrew()

  const parsed = tripSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) }
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
    return { ok: false, message: error?.message ?? 'Could not save the trip.' }
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
  // The detail route too, or an edit redirects straight back to a cached copy
  // of the values that were just replaced.
  revalidatePath(`/trips/${trip.id}`)
  return { ok: true, tripId: trip.id }
}

export async function saveTrip(
  _prev: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  const result = await persistTrip(formData)

  if (!result.ok) {
    return {
      status: 'error',
      message: result.message,
      fieldErrors: result.fieldErrors,
    }
  }

  redirect(`/trips/${result.tripId}`)
}

/**
 * The offline flush path. Returns success as a value so the queue can tell a
 * real failure from a redirect and keep the draft rather than dropping it.
 */
export async function syncTripDraft(
  formData: FormData,
): Promise<{ ok: boolean; message?: string }> {
  try {
    const result = await persistTrip(formData)
    if (result.ok) return { ok: true }
    return {
      ok: false,
      message:
        result.message ?? Object.values(result.fieldErrors ?? {})[0]?.[0] ?? 'Rejected',
    }
  } catch (error) {
    // requireCrew() redirects by throwing. Swallowing that would leave a
    // signed-out or demoted user's draft retrying forever instead of sending
    // them to sign in again.
    if (isRedirectError(error)) throw error
    return { ok: false, message: error instanceof Error ? error.message : 'Failed' }
  }
}

function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    (error as { digest: string }).digest.startsWith('NEXT_REDIRECT')
  )
}

export async function refetchConditions(tripId: string): Promise<void> {
  await requireCrew()
  await attachConditions(tripId)
  revalidatePath(`/trips/${tripId}`)
}

export async function deleteTrip(tripId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()

  const { error } = await supabase.from('trips').delete().eq('id', tripId)
  // Redirecting regardless would tell the owner a trip was deleted when it is
  // still there.
  if (error) throw new Error(`Could not delete the trip: ${error.message}`)

  revalidatePath('/trips')
  revalidatePath('/')
  redirect('/trips')
}

/** Collapses Zod issues into the per-field shape the form renders. */
function fieldErrorsFrom(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>
}): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '_form')
    fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message]
  }
  return fieldErrors
}
