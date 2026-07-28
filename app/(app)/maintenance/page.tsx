import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { getCurrentEngineHours } from '@/lib/db/queries'
import {
  computeDueStatus,
  type IntervalUnit,
  type ServiceCategory,
} from '@/lib/maintenance/due'
import { DueBanner } from '@/components/maintenance/DueBanner'
import { ServiceForm } from '@/components/maintenance/ServiceForm'
import { ServiceEntry } from '@/components/maintenance/ServiceEntry'
import {
  ScheduleCard,
  type ScheduleIntervals,
} from '@/components/maintenance/ScheduleCard'
import {
  Annotation,
  Card,
  EmptyState,
  StatTile,
} from '@/components/ui/primitives'
import { formatHours, formatMoney } from '@/lib/format/units'

/** Both columns are checked text columns, so they arrive untyped. */
function asCategory(value: string): ServiceCategory {
  return value === 'bill' ? 'bill' : 'mechanical'
}

function asUnit(value: string | null): IntervalUnit | null {
  return value === 'day' || value === 'week' || value === 'month' || value === 'year'
    ? value
    : null
}

export default async function MaintenancePage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [{ data: schedules }, { data: log }, currentHours] = await Promise.all([
    supabase
      .from('maintenance_schedule')
      .select(
        'id, service_type, category, interval_hours, interval_count, interval_unit, active',
      )
      .eq('boat_id', membership.boatId)
      .order('service_type'),
    supabase
      .from('maintenance_log')
      .select(
        'id, service_date, service_type, engine_hours_at_service, cost, performed_by, notes',
      )
      .eq('boat_id', membership.boatId)
      .order('service_date', { ascending: false }),
    getCurrentEngineHours(membership.boatId),
  ])

  const rows = (schedules ?? []).map((row) => ({
    ...row,
    category: asCategory(row.category),
    interval_unit: asUnit(row.interval_unit),
  }))

  // Every item gets a card, tracked or not — the interval editor lives on the
  // card now, so an untracked item would otherwise be unreachable and could
  // never be switched back on.
  const items = computeDueStatus(
    rows.map((row) => ({ ...row, active: true })),
    log ?? [],
    currentHours,
    new Date(),
  )

  const intervals = new Map<string, ScheduleIntervals>(
    rows.map((row) => [
      row.id,
      {
        interval_hours: row.interval_hours,
        interval_count: row.interval_count,
        interval_unit: row.interval_unit,
        active: row.active,
      },
    ]),
  )

  const cards = items.flatMap((item) => {
    const row = item.scheduleId === null ? undefined : intervals.get(item.scheduleId)
    return row ? [{ item, intervals: row }] : []
  })

  const mechanical = cards.filter((card) => card.item.category === 'mechanical')
  const bills = cards.filter((card) => card.item.category === 'bill')

  // Untracked items still show, but must not raise a warning.
  const tracked = cards
    .filter((card) => card.intervals.active)
    .map((card) => card.item)

  const serviceTypes = rows.map((row) => row.service_type)
  const billTypes = rows
    .filter((row) => row.category === 'bill')
    .map((row) => row.service_type)
  const isCrew = membership.role === 'crew'

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Service</h1>
        <Annotation>
          Engine at {formatHours(currentHours)} hours
        </Annotation>
      </div>

      <DueBanner items={tracked} />

      {mechanical.length > 0 ? (
        <div>
          <Annotation>Maintenance</Annotation>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {mechanical.map((card) => (
              <li key={card.item.serviceType}>
                <ScheduleCard {...card} canEdit={isCrew} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bills.length > 0 ? (
        <div>
          <Annotation>Recurring bills</Annotation>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {bills.map((card) => (
              <li key={card.item.serviceType}>
                <ScheduleCard {...card} canEdit={isCrew} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {isCrew ? (
        <>
          <Card className="flex flex-col gap-4">
            <Annotation>Log a service</Annotation>
            <ServiceForm
              serviceTypes={serviceTypes}
              billTypes={billTypes}
              currentHours={currentHours}
            />
          </Card>
        </>
      ) : null}

      <div>
        <Annotation>History</Annotation>
        {log && log.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {log.map((entry) => (
              <li key={entry.id}>
                <ServiceEntry
                  entry={entry}
                  serviceTypes={serviceTypes}
                  billTypes={billTypes}
                  canEdit={isCrew}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="mt-2">
            <EmptyState title="No services logged yet">
              <p>
                Log the last oil change and the schedule starts tracking against
                engine hours.
              </p>
            </EmptyState>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile
          label="Services logged"
          value={String(log?.length ?? 0)}
        />
        <StatTile
          label="Spent on service"
          value={formatMoney(
            (log ?? []).reduce((sum, entry) => sum + (entry.cost ?? 0), 0),
          )}
        />
      </div>
    </div>
  )
}
