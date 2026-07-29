/**
 * What the boat costs, grouped. Pure — no database access.
 *
 * Money comes from two places that have nothing else in common: fuel bought on
 * a trip, and everything in the maintenance log, which by now means yard work,
 * batteries, and the bills that keep her in the slip. Both are spend, so both
 * are flattened into one list before anything is totalled.
 */

export type SpendEntry = { year: string; type: string; amount: number }

export type SpendRow = { label: string; value: number }

/** Fuel has no service type of its own, so it gets one here. */
export const FUEL_TYPE = 'Fuel'

type TripCost = { trip_date: string; fuel_cost_usd: number | null }
type ServiceCost = {
  service_date: string
  service_type: string
  cost: number | null
}

/**
 * Everything spent, as one flat list.
 *
 * Entries without a cost are dropped rather than counted as zero: a trip with
 * no price per gallon recorded is a gap in the record, not a free tank.
 */
export function spendEntries(
  trips: TripCost[],
  services: ServiceCost[],
): SpendEntry[] {
  const entries: SpendEntry[] = []

  for (const trip of trips) {
    const amount = trip.fuel_cost_usd ?? 0
    if (amount > 0) {
      entries.push({ year: trip.trip_date.slice(0, 4), type: FUEL_TYPE, amount })
    }
  }

  for (const service of services) {
    const amount = service.cost ?? 0
    if (amount > 0) {
      entries.push({
        year: service.service_date.slice(0, 4),
        type: service.service_type,
        amount,
      })
    }
  }

  return entries
}

/** The years there is anything to show, oldest first. */
export function spendYears(entries: SpendEntry[]): string[] {
  return [...new Set(entries.map((entry) => entry.year))].sort()
}

/**
 * Totals per type, biggest first, for one year or for all of them.
 *
 * Sorted by size rather than name because the question this answers is "what is
 * the money going on", and that reads straight down the list.
 */
export function totalsByType(
  entries: SpendEntry[],
  year: string | null,
): SpendRow[] {
  const totals = new Map<string, number>()

  for (const entry of entries) {
    if (year !== null && entry.year !== year) continue
    totals.set(entry.type, (totals.get(entry.type) ?? 0) + entry.amount)
  }

  return [...totals.entries()]
    .map(([label, value]) => ({ label, value: Math.round(value * 100) / 100 }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
}
