import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { getBoat, getCurrentEngineHours } from '@/lib/db/queries'
import { BarChart } from '@/components/charts/Charts'
import { Annotation, Card, StatTile } from '@/components/ui/primitives'
import { summariseFleet } from '@/lib/trips/derive'
import {
  formatDistance,
  formatGallons,
  formatHours,
  formatMoney,
} from '@/lib/format/units'

export default async function StatsPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [boat, currentHours, { data: trips }] = await Promise.all([
    getBoat(membership.boatId),
    getCurrentEngineHours(membership.boatId),
    supabase
      .from('trips')
      .select('trip_date, hours_run, distance_nm, fuel_used_gal, fuel_cost_usd')
      .eq('boat_id', membership.boatId)
      .order('trip_date'),
  ])

  const rows = trips ?? []
  const fleet = summariseFleet(rows)

  const tripsByYear = new Map<string, number>()
  const hoursByYear = new Map<string, number>()
  for (const trip of rows) {
    const year = trip.trip_date.slice(0, 4)
    tripsByYear.set(year, (tripsByYear.get(year) ?? 0) + 1)
    hoursByYear.set(year, (hoursByYear.get(year) ?? 0) + (trip.hours_run ?? 0))
  }

  const years = [...tripsByYear.keys()].sort()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Annotation>Since the logbook started</Annotation>
        <h1 className="text-2xl font-semibold tracking-tight">Lifetime</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Trips" value={String(fleet.tripCount)} />
        <StatTile label="Hours logged" value={formatHours(fleet.totalHours)} />
        <StatTile label="Distance" value={formatDistance(fleet.totalNm)} unit="nm" />
        <StatTile label="Fuel burned" value={formatGallons(fleet.totalFuelGal)} unit="gal" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Engine hours"
          value={formatHours(currentHours)}
          sub="Highest reading logged"
        />
        <StatTile
          label="Average"
          value={fleet.avgNmPerGal === null ? '—' : fleet.avgNmPerGal.toFixed(2)}
          unit="nm/gal"
        />
        <StatTile label="Fuel spend" value={formatMoney(fleet.totalCostUsd)} />
        <StatTile
          label="Tank"
          value={boat?.fuel_capacity_gal ? String(boat.fuel_capacity_gal) : '—'}
          unit="gal"
        />
      </div>

      <Card className="flex flex-col gap-3">
        <Annotation>Trips per year</Annotation>
        <BarChart
          bars={years.map((year) => ({
            label: year,
            value: tripsByYear.get(year) ?? 0,
          }))}
          emptyMessage="No trips logged yet"
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <Annotation>Hours per year</Annotation>
        <BarChart
          bars={years.map((year) => ({
            label: year,
            value: Math.round(hoursByYear.get(year) ?? 0),
          }))}
          emptyMessage="No hours logged yet"
        />
      </Card>
    </div>
  )
}
