import Link from 'next/link'
import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { getBoat, getCurrentEngineHours } from '@/lib/db/queries'
import { computeDueStatus } from '@/lib/maintenance/due'
import { documentStatus } from '@/lib/documents/expiry'
import { summariseFleet } from '@/lib/trips/derive'
import { DueBanner } from '@/components/maintenance/DueBanner'
import {
  Annotation,
  Banner,
  Card,
  EmptyState,
  StatTile,
} from '@/components/ui/primitives'
import { formatDistance, formatGallons, formatHours } from '@/lib/format/units'
import type { ConditionsSnapshot } from '@/lib/conditions/types'

export default async function DashboardPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [
    boat,
    currentHours,
    { data: schedules },
    { data: serviceLog },
    { data: trips },
    { data: documents },
  ] = await Promise.all([
    getBoat(membership.boatId),
    getCurrentEngineHours(membership.boatId),
    supabase
      .from('maintenance_schedule')
      .select(
        'id, service_type, category, interval_hours, interval_months, annual_due_month, annual_due_day, due_at_hours_override, due_on_date_override, override_anchor_date, active',
      )
      .eq('boat_id', membership.boatId),
    supabase
      .from('maintenance_log')
      .select('service_type, service_date, engine_hours_at_service')
      .eq('boat_id', membership.boatId),
    supabase
      .from('trips')
      .select(
        'id, trip_date, hours_run, distance_nm, fuel_used_gal, fuel_cost_usd, conditions_snapshot',
      )
      .eq('boat_id', membership.boatId)
      .order('trip_date', { ascending: false }),
    supabase
      .from('documents')
      .select('id, type, label, expires_on')
      .eq('boat_id', membership.boatId),
  ])

  const dueItems = computeDueStatus(
    (schedules ?? []).map((row) => ({
      ...row,
      category: row.category === 'bill' ? ('bill' as const) : ('mechanical' as const),
    })),
    serviceLog ?? [],
    currentHours,
    new Date(),
  )

  const fleet = summariseFleet(trips ?? [])
  const latest = trips?.[0]
  const latestSnapshot = latest?.conditions_snapshot as ConditionsSnapshot | null

  const expiringDocs = (documents ?? []).filter(
    (doc) => documentStatus(doc.expires_on, new Date()) !== 'ok',
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Annotation>{boat?.home_port ?? 'Home port'}</Annotation>
        <h1 className="text-2xl font-semibold tracking-tight">
          {boat?.name ?? 'Alice May'}
        </h1>
        <p className="text-sm text-hull-700/70 dark:text-chart-200/60">
          {boat?.year} {boat?.make_model} · {boat?.engine_make_model}
        </p>
      </div>

      <DueBanner items={dueItems} />

      {expiringDocs.length > 0 ? (
        <Banner
          tone={
            expiringDocs.some(
              (doc) => documentStatus(doc.expires_on, new Date()) === 'expired',
            )
              ? 'overdue'
              : 'soon'
          }
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>
              {expiringDocs.length} document
              {expiringDocs.length === 1 ? '' : 's'} expiring or expired.
            </span>
            <Link href="/documents" className="text-sm font-semibold underline">
              Open documents
            </Link>
          </div>
        </Banner>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Engine hours" value={formatHours(currentHours)} />
        <StatTile label="Trips" value={String(fleet.tripCount)} />
        <StatTile label="Distance" value={formatDistance(fleet.totalNm)} unit="nm" />
        <StatTile label="Fuel burned" value={formatGallons(fleet.totalFuelGal)} unit="gal" />
      </div>

      {latest ? (
        <Link href={`/trips/${latest.id}`} className="block">
          <Card className="flex flex-col gap-2 transition-colors hover:border-magenta-500/50">
            <Annotation>Last trip</Annotation>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="font-semibold">
                {new Date(`${latest.trip_date}T12:00:00`).toLocaleDateString('en-US', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </span>
              <span className="readout text-sm opacity-70">
                {formatHours(latest.hours_run)} h · {formatDistance(latest.distance_nm)} nm
              </span>
            </div>
            {latestSnapshot?.summary ? (
              <p className="readout text-sm text-shoal-700 dark:text-shoal-300">
                {latestSnapshot.summary}
              </p>
            ) : null}
          </Card>
        </Link>
      ) : (
        <EmptyState title="No trips yet">
          {membership.role === 'crew' ? (
            <p>
              <Link
                href="/trips/new"
                className="font-semibold text-magenta-600 underline dark:text-magenta-400"
              >
                Log your first trip
              </Link>{' '}
              and the wind, swell, and tides get attached for you.
            </p>
          ) : (
            <p>Trips will show up here once the crew logs them.</p>
          )}
        </EmptyState>
      )}
    </div>
  )
}
