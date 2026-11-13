/**
 * What a logged trip contributes to a point, for the tooltip. Raw values, not
 * strings: the client formats them with the same helpers as everywhere else.
 */
export type TripPointMeta = {
  tripId: string
  /** YYYY-MM-DD */
  date: string
  distanceMi: number | null
  distanceNm: number | null
  hours: number | null
  fuelGal: number | null
  miPerGal: number | null
  galPerHour: number | null
  /** Already cut short on the server, so long notes do not ride along. */
  notes: string | null
}

/**
 * On a LineChart, x is the trip's slot: its position in date order among the
 * plotted trips (0, 1, 2, …). Every series uses the same slot for the same trip.
 */
export type Point = { x: number; y: number; label?: string; meta?: TripPointMeta }

export type Series = { label: string; points: Point[]; tone?: 'primary' | 'secondary' }
