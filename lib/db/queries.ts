import { createClient } from '@/lib/supabase/server'
import { latestEngineHours } from '@/lib/engine/hours'

export type Boat = {
  id: string
  name: string
  make_model: string | null
  year: number | null
  engine_make_model: string | null
  fuel_capacity_gal: number | null
  home_port: string | null
  home_lat: number | null
  home_lng: number | null
  tide_station_id: string | null
}

export async function getBoat(boatId: string): Promise<Boat | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('boats')
    .select(
      'id, name, make_model, year, engine_make_model, fuel_capacity_gal, home_port, home_lat, home_lng, tide_station_id',
    )
    .eq('id', boatId)
    .maybeSingle()
  return data
}

/**
 * Current engine hours, taken from the highest reading ever logged rather than
 * the most recent trip — an hour meter only counts up, and a trip entered out
 * of order should not appear to wind it back.
 */
/**
 * The engine's current hours: the highest reading from either the end of a
 * trip or a service entry. A service logged after an untracked run can be
 * the newer figure, so trips alone would under-report.
 */
export async function getCurrentEngineHours(boatId: string): Promise<number | null> {
  const supabase = await createClient()
  const [{ data: trip }, { data: service }] = await Promise.all([
    supabase
      .from('trips')
      .select('engine_hours_end')
      .eq('boat_id', boatId)
      .not('engine_hours_end', 'is', null)
      .order('engine_hours_end', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('maintenance_log')
      .select('engine_hours_at_service')
      .eq('boat_id', boatId)
      .not('engine_hours_at_service', 'is', null)
      .order('engine_hours_at_service', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  return latestEngineHours(trip?.engine_hours_end, service?.engine_hours_at_service)
}

export type FuelReading = { gal: number; tripDate: string }

/**
 * The fuel gauge at the end of the most recent trip that recorded one — by
 * date, then departure time, then when it was logged. Deliberately not the
 * highest reading: the gauge counts gallons used since the tank was last
 * full, so it drops back to zero at every fill.
 */
export async function getLastFuelReading(boatId: string): Promise<FuelReading | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('trips')
    .select('fuel_from_full_end_gal, trip_date')
    .eq('boat_id', boatId)
    .not('fuel_from_full_end_gal', 'is', null)
    .order('trip_date', { ascending: false })
    // Descending puts nulls first in Postgres; a trip with no departure time
    // must not outrank one that has it on the same day.
    .order('departure_time', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data || data.fuel_from_full_end_gal === null) return null
  return { gal: data.fuel_from_full_end_gal, tripDate: data.trip_date }
}

export async function getCrewOptions(boatId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('crew')
    .select('id, name')
    .eq('boat_id', boatId)
    .order('name')
  return (data ?? []).map((row) => ({ id: row.id, label: row.name }))
}

export async function getSiteOptions(boatId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('points_of_interest')
    .select('id, name, category')
    .eq('boat_id', boatId)
    .order('name')
  return (data ?? []).map((row) => ({ id: row.id, label: row.name }))
}
