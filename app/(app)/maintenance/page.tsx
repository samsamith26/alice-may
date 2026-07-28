import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { getCurrentEngineHours } from '@/lib/db/queries'
import { computeDueStatus, type ServiceCategory } from '@/lib/maintenance/due'
import { DueBanner } from '@/components/maintenance/DueBanner'
import { ServiceForm } from '@/components/maintenance/ServiceForm'
import { ServiceEntry } from '@/components/maintenance/ServiceEntry'
import { ScheduleCard } from '@/components/maintenance/ScheduleCard'
import { ScheduleEditor } from '@/components/maintenance/ScheduleEditor'
import {
  Annotation,
  Card,
  EmptyState,
  StatTile,
} from '@/components/ui/primitives'
import { formatHours, formatMoney } from '@/lib/format/units'

/** The column is a checked text column, so it arrives untyped. */
function asCategory(value: string): ServiceCategory {
  return value === 'bill' ? 'bill' : 'mechanical'
}

export default async function MaintenancePage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [{ data: schedules }, { data: log }, currentHours] = await Promise.all([
    supabase
      .from('maintenance_schedule')
      .select(
        'id, service_type, category, interval_hours, interval_months, annual_due_month, annual_due_day, due_at_hours_override, due_on_date_override, override_anchor_date, active',
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
  }))

  const items = computeDueStatus(rows, log ?? [], currentHours, new Date())
  const mechanical = items.filter((item) => item.category === 'mechanical')
  const bills = items.filter((item) => item.category === 'bill')

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

      <DueBanner items={items} />

      {mechanical.length > 0 ? (
        <div>
          <Annotation>Maintenance</Annotation>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {mechanical.map((item) => (
              <li key={item.serviceType}>
                <ScheduleCard item={item} canEdit={isCrew} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {bills.length > 0 ? (
        <div>
          <Annotation>Recurring bills</Annotation>
          <ul className="mt-2 grid gap-2 sm:grid-cols-2">
            {bills.map((item) => (
              <li key={item.serviceType}>
                <ScheduleCard item={item} canEdit={isCrew} />
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
          <ScheduleEditor
            rows={rows.filter((row) => row.category === 'mechanical')}
          />
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
