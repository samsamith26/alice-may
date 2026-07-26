import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { ConditionsCard } from '@/components/trips/ConditionsCard'
import { PhotoStrip } from '@/components/trips/PhotoStrip'
import { DeleteTripButton } from '@/components/trips/DeleteTripButton'
import {
  Annotation,
  Card,
  Readout,
  StatTile,
} from '@/components/ui/primitives'
import {
  formatDistance,
  formatGallons,
  formatHours,
  formatMoney,
} from '@/lib/format/units'
import { gallonsPerHour, nmPerGallon } from '@/lib/trips/derive'
import type { ConditionsSnapshot, ConditionsStatus } from '@/lib/conditions/types'

function longDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function shortTime(value: string | null) {
  if (!value) return '—'
  const [hours, minutes] = value.split(':').map(Number)
  if (!Number.isFinite(hours)) return '—'
  const suffix = hours >= 12 ? 'pm' : 'am'
  return `${hours % 12 === 0 ? 12 : hours % 12}:${String(minutes).padStart(2, '0')}${suffix}`
}

export default async function TripDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const membership = await requireMembership()
  const supabase = await createClient()

  const { data: trip } = await supabase
    .from('trips')
    .select(
      'id, trip_date, departure_time, return_time, engine_hours_start, engine_hours_end, hours_run, fuel_level_start_gal, fuel_added_gal, fuel_level_end_gal, fuel_used_gal, fuel_price_per_gal, fuel_cost_usd, distance_nm, start_lat, start_lng, end_lat, end_lng, notes, conditions_snapshot, conditions_status, trip_passengers(crew(id, name)), trip_sites(points_of_interest(id, name, category))',
    )
    .eq('id', id)
    .maybeSingle()

  if (!trip) notFound()

  const isCrew = membership.role === 'crew'
  const efficiency = nmPerGallon(trip.distance_nm, trip.fuel_used_gal)
  const burnRate = gallonsPerHour(trip.fuel_used_gal, trip.hours_run)

  const passengers = trip.trip_passengers
    .map((row) => row.crew)
    .filter((crew): crew is { id: string; name: string } => crew !== null)

  const sites = trip.trip_sites
    .map((row) => row.points_of_interest)
    .filter(
      (site): site is { id: string; name: string; category: string } => site !== null,
    )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Annotation>Trip</Annotation>
          <h1 className="text-2xl font-semibold tracking-tight">
            {longDate(trip.trip_date)}
          </h1>
          <p className="readout mt-1 text-sm text-hull-700/70 dark:text-chart-200/60">
            {shortTime(trip.departure_time)} → {shortTime(trip.return_time)}
          </p>
        </div>

        {isCrew ? (
          <div className="flex gap-2">
            <Link
              href={`/trips/${trip.id}/edit`}
              className="inline-flex min-h-12 items-center rounded-md border border-hull-800/25 px-4 text-sm font-semibold dark:border-chart-200/25"
            >
              Edit
            </Link>
            <DeleteTripButton tripId={trip.id} />
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Hours run" value={formatHours(trip.hours_run)} />
        <StatTile label="Distance" value={formatDistance(trip.distance_nm)} unit="nm" />
        <StatTile label="Fuel used" value={formatGallons(trip.fuel_used_gal)} unit="gal" />
        <StatTile
          label="Fuel cost"
          value={trip.fuel_cost_usd ? formatMoney(trip.fuel_cost_usd) : '—'}
        />
      </div>

      <ConditionsCard
        tripId={trip.id}
        snapshot={trip.conditions_snapshot as ConditionsSnapshot | null}
        status={trip.conditions_status as ConditionsStatus | null}
        canRetry={isCrew}
      />

      <div className="grid gap-3 md:grid-cols-2">
        <Card className="flex flex-col gap-3">
          <Annotation>Engine &amp; fuel</Annotation>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="opacity-70">Hours at start</dt>
            <dd><Readout value={formatHours(trip.engine_hours_start)} /></dd>
            <dt className="opacity-70">Hours at end</dt>
            <dd><Readout value={formatHours(trip.engine_hours_end)} /></dd>
            <dt className="opacity-70">Fuel added</dt>
            <dd><Readout value={formatGallons(trip.fuel_added_gal)} unit="gal" /></dd>
            <dt className="opacity-70">Efficiency</dt>
            <dd>
              <Readout
                value={efficiency === null ? '—' : efficiency.toFixed(2)}
                unit={efficiency === null ? undefined : 'nm/gal'}
              />
            </dd>
            <dt className="opacity-70">Burn rate</dt>
            <dd>
              <Readout
                value={burnRate === null ? '—' : burnRate.toFixed(2)}
                unit={burnRate === null ? undefined : 'gal/h'}
              />
            </dd>
          </dl>
        </Card>

        <Card className="flex flex-col gap-3">
          <Annotation>Aboard</Annotation>
          {passengers.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {passengers.map((crew) => (
                <li
                  key={crew.id}
                  className="rounded-full bg-hull-800/8 px-3 py-1 text-sm dark:bg-chart-100/10"
                >
                  {crew.name}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm opacity-60">Nobody recorded.</p>
          )}

          <Annotation className="mt-2">Sites visited</Annotation>
          {sites.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {sites.map((site) => (
                <li key={site.id}>
                  <Link
                    href={`/sites/${site.id}`}
                    className="rounded-full bg-shoal-500/12 px-3 py-1 text-sm text-shoal-700 underline-offset-2 hover:underline dark:text-shoal-300"
                  >
                    {site.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm opacity-60">None recorded.</p>
          )}
        </Card>
      </div>

      {trip.notes ? (
        <Card className="flex flex-col gap-2">
          <Annotation>Notes</Annotation>
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{trip.notes}</p>
        </Card>
      ) : null}

      <PhotoStrip tripId={trip.id} boatId={membership.boatId} canEdit={isCrew} />
    </div>
  )
}
