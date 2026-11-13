import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { BarChart, LineChart, type TripPointMeta } from '@/components/charts/Charts'
import { SpendByType } from '@/components/fuel/SpendByType'
import { Annotation, Card, StatTile } from '@/components/ui/primitives'
import { gallonsPerHour, milesPerGallon, summariseFleet } from '@/lib/trips/derive'
import { spendEntries, spendYears } from '@/lib/fuel/spend'
import { excerpt } from '@/lib/format/text'
import { fullDate } from '@/lib/format/dates'
import { formatDollars, formatGallons, formatMoney } from '@/lib/format/units'

export default async function FuelPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [{ data: trips }, { data: services }] = await Promise.all([
    supabase
      .from('trips')
      .select(
        'id, trip_date, hours_run, distance_nm, distance_mi, fuel_used_gal, fuel_cost_usd, fuel_price_per_gal, notes',
      )
      .eq('boat_id', membership.boatId)
      .order('trip_date')
      .order('created_at'),
    supabase
      .from('maintenance_log')
      .select('service_date, service_type, cost')
      .eq('boat_id', membership.boatId),
  ])

  const rows = trips ?? []
  const fleet = summariseFleet(rows)

  // Each trip's figures, worked out once and carried on both lines' points so
  // the chart's tooltip can show the whole trip without another query.
  const measured = rows.flatMap((trip) => {
    const meta: TripPointMeta = {
      tripId: trip.id,
      date: trip.trip_date,
      distanceMi: trip.distance_mi,
      distanceNm: trip.distance_nm,
      hours: trip.hours_run,
      fuelGal: trip.fuel_used_gal,
      miPerGal: milesPerGallon(trip.distance_nm, trip.fuel_used_gal),
      galPerHour: gallonsPerHour(trip.fuel_used_gal, trip.hours_run),
      notes: excerpt(trip.notes, 90),
    }
    // A trip with nothing to plot on either line takes no slot.
    return meta.miPerGal === null && meta.galPerHour === null ? [] : [meta]
  })

  // One evenly spaced slot per trip, in date order, shared by both lines so a
  // trip's two dots stay stacked.
  const plotted = measured.map((meta, slot) => ({ x: slot, label: meta.date, meta }))
  const slotDates = measured.map((meta) => meta.date)

  // Trips missing distance or fuel are skipped, never plotted as zero — a gap
  // in the record is not an efficiency of nought.
  const efficiency = plotted.flatMap((point) =>
    point.meta.miPerGal === null ? [] : [{ ...point, y: point.meta.miPerGal }],
  )

  const burn = plotted.flatMap((point) =>
    point.meta.galPerHour === null ? [] : [{ ...point, y: point.meta.galPerHour }],
  )

  const costByTrip = rows
    .filter((trip) => (trip.fuel_cost_usd ?? 0) > 0)
    .slice(-12)
    .map((trip) => ({
      // The axis has room for month-day only; the tooltip gives the full date.
      label: trip.trip_date.slice(5),
      value: Number(trip.fuel_cost_usd),
      title: fullDate(trip.trip_date),
      display: formatMoney(Number(trip.fuel_cost_usd)),
      href: `/trips/${trip.id}`,
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
          value={fleet.avgMiPerGal === null ? '—' : fleet.avgMiPerGal.toFixed(2)}
          unit="mi/gal"
          sub={fleet.avgNmPerGal === null ? undefined : `${fleet.avgNmPerGal.toFixed(2)} nm/gal`}
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
          <Annotation>Fuel efficiency over time</Annotation>
          <p className="mt-1 text-sm text-hull-700/75 dark:text-chart-200/65">
            A steady drop in miles per gallon is the first sign of a fouled
            prop or a sick injector — usually well before anything sounds
            wrong. Tap a point to see that trip.
          </p>
        </div>
        {/* No single y-axis label: the two lines are different units, and
            the legend names each. */}
        <LineChart
          title="Fuel efficiency over time"
          slotDates={slotDates}
          height={200}
          series={[
            { label: 'mi/gal', points: efficiency, tone: 'primary' },
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
