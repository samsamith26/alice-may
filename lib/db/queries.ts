import { createClient } from '@/lib/supabase/server'

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
export async function getCurrentEngineHours(boatId: string): Promise<number | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('trips')
    .select('engine_hours_end')
    .eq('boat_id', boatId)
    .not('engine_hours_end', 'is', null)
    .order('engine_hours_end', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.engine_hours_end ?? null
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
