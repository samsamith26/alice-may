import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { BarChart, LineChart } from '@/components/charts/Charts'
import { SpendByType } from '@/components/fuel/SpendByType'
import { Annotation, Card, StatTile } from '@/components/ui/primitives'
import { gallonsPerHour, nmPerGallon, summariseFleet } from '@/lib/trips/derive'
import { spendEntries, spendYears } from '@/lib/fuel/spend'
import { formatDollars, formatGallons, formatMoney } from '@/lib/format/units'

export default async function FuelPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [{ data: trips }, { data: services }] = await Promise.all([
    supabase
      .from('trips')
      .select(
        'id, trip_date, hours_run, distance_nm, fuel_used_gal, fuel_cost_usd, fuel_price_per_gal',
      )
      .eq('boat_id', membership.boatId)
      .order('trip_date'),
    supabase
      .from('maintenance_log')
      .select('service_date, service_type, cost')
      .eq('boat_id', membership.boatId),
  ])

  const rows = trips ?? []
  const fleet = summariseFleet(rows)

  // Trips missing distance or fuel are skipped, never plotted as zero — a gap
  // in the record is not an efficiency of nought.
  const efficiency = rows.flatMap((trip, index) => {
    const value = nmPerGallon(trip.distance_nm, trip.fuel_used_gal)
    return value === null ? [] : [{ x: index, y: value, label: trip.trip_date }]
  })

  const burn = rows.flatMap((trip, index) => {
    const value = gallonsPerHour(trip.fuel_used_gal, trip.hours_run)
    return value === null ? [] : [{ x: index, y: value, label: trip.trip_date }]
  })

  const costByTrip = rows
    .filter((trip) => (trip.fuel_cost_usd ?? 0) > 0)
    .slice(-12)
    .map((trip) => ({
      label: trip.trip_date.slice(5),
      value: Number(trip.fuel_cost_usd),
    }))

  const spendByYear = new Map<string, number>()
  for (const trip of rows) {
    const year = trip.trip_date.slice(0, 4)
    spendByYear.set(year, (spendByYear.get(year) ?? 0) + (trip.fuel_cost_usd ?? 0))
  }
  for (const service of services ?? []) {
    const year = service.service_date.slice(0, 4)
    spendByYear.set(year, (spendByYear.get(year) ?? 0) + (service.cost ?? 0))
  }
  const annualSpend = [...spendByYear.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, value]) => ({ label: year, value: Math.round(value) }))

  // Fuel and everything in the maintenance log are both spend, so the
  // breakdown draws on the same two queries the annual totals already use.
  const entries = spendEntries(rows, services ?? [])

  const thisYear = String(new Date().getFullYear())
  const priciest = rows.reduce<number>(
    (max, trip) => Math.max(max, trip.fuel_cost_usd ?? 0),
    0,
  )

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Fuel &amp; Cost</h1>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile
          label="Average"
          value={fleet.avgNmPerGal === null ? '—' : fleet.avgNmPerGal.toFixed(2)}
          unit="nm/gal"
        />
        <StatTile
          label={`Spend ${thisYear}`}
          value={formatMoney(spendByYear.get(thisYear) ?? 0)}
        />
        <StatTile label="Fuel burned" value={formatGallons(fleet.totalFuelGal)} unit="gal" />
        <StatTile
          label="Priciest trip"
          value={priciest > 0 ? formatMoney(priciest) : '—'}
        />
      </div>

      <Card className="flex flex-col gap-3">
        <div>
          <h2 className="font-semibold">Fuel efficiency over time</h2>
          <p className="mt-1 text-sm text-hull-700/75 dark:text-chart-200/65">
            A steady drop in nautical miles per gallon is the first sign of a
            fouled prop or a sick injector — usually well before anything sounds
            wrong.
          </p>
        </div>
        <LineChart
          yLabel="nm per gallon"
          series={[
            { label: 'nm/gal', points: efficiency, tone: 'primary' },
            { label: 'gal/hour', points: burn, tone: 'secondary' },
          ]}
          emptyMessage="Log distance and fuel on two trips to see the trend"
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <Annotation>Fuel cost per trip</Annotation>
        <BarChart
          bars={costByTrip}
          emptyMessage="Add a price per gallon when logging fuel to track cost"
        />
      </Card>

      <Card className="flex flex-col gap-3">
        <Annotation>Spend by year</Annotation>
        <BarChart
          bars={annualSpend}
          formatValue={formatDollars}
          emptyMessage="No spending recorded yet"
        />
      </Card>

      <Card>
        <SpendByType entries={entries} years={spendYears(entries)} />
      </Card>
    </div>
  )
}
