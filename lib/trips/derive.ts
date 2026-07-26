/**
 * Fuel and efficiency maths. Pure — no database access, no imports.
 *
 * Every rate returns null rather than a number when its inputs cannot support
 * one, so a divide-by-zero never reaches a chart as Infinity or a dashboard as
 * a confident wrong answer.
 */

export type TripMetrics = {
  hours_run: number | null
  distance_nm: number | null
  fuel_used_gal: number | null
  fuel_cost_usd: number | null
}

export type FleetSummary = {
  totalHours: number
  totalNm: number
  totalFuelGal: number
  totalCostUsd: number
  tripCount: number
  avgNmPerGal: number | null
}

function positive(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
}

function nonNegative(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/** Nautical miles per gallon — the fouled-prop early warning. */
export function nmPerGallon(
  distanceNm: number | null | undefined,
  fuelUsedGal: number | null | undefined,
): number | null {
  if (!nonNegative(distanceNm) || !positive(fuelUsedGal)) return null
  return distanceNm / fuelUsedGal
}

export function gallonsPerHour(
  fuelUsedGal: number | null | undefined,
  hoursRun: number | null | undefined,
): number | null {
  if (!nonNegative(fuelUsedGal) || !positive(hoursRun)) return null
  return fuelUsedGal / hoursRun
}

export function summariseFleet(trips: TripMetrics[]): FleetSummary {
  const totals = trips.reduce(
    (acc, trip) => ({
      totalHours: acc.totalHours + (nonNegative(trip.hours_run) ? trip.hours_run : 0),
      totalNm: acc.totalNm + (nonNegative(trip.distance_nm) ? trip.distance_nm : 0),
      totalFuelGal:
        acc.totalFuelGal + (nonNegative(trip.fuel_used_gal) ? trip.fuel_used_gal : 0),
      totalCostUsd:
        acc.totalCostUsd + (nonNegative(trip.fuel_cost_usd) ? trip.fuel_cost_usd : 0),
    }),
    { totalHours: 0, totalNm: 0, totalFuelGal: 0, totalCostUsd: 0 },
  )

  // Efficiency aggregates only over trips that measured BOTH distance and
  // fuel. Dividing the fleet's total distance by its total fuel would pair a
  // trip that logged distance but no fuel with a different trip that logged
  // fuel but no distance, and report the ratio of two unrelated numbers as if
  // it meant something. Every field on a trip is optional, so that mismatch is
  // ordinary data entry, not an edge case.
  const measured = trips.reduce(
    (acc, trip) =>
      nonNegative(trip.distance_nm) && positive(trip.fuel_used_gal)
        ? { nm: acc.nm + trip.distance_nm, gal: acc.gal + trip.fuel_used_gal }
        : acc,
    { nm: 0, gal: 0 },
  )

  return {
    ...totals,
    tripCount: trips.length,
    avgNmPerGal: nmPerGallon(measured.nm, measured.gal),
  }
}
