import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { getCurrentEngineHours } from '@/lib/db/queries'
import { computeDueStatus } from '@/lib/maintenance/due'
import { DueBanner } from '@/components/maintenance/DueBanner'
import { ServiceForm } from '@/components/maintenance/ServiceForm'
import {
  Annotation,
  Card,
  EmptyState,
  Pill,
  Readout,
  StatTile,
} from '@/components/ui/primitives'
import { formatHours, formatMoney } from '@/lib/format/units'

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function MaintenancePage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [{ data: schedules }, { data: log }, currentHours] = await Promise.all([
    supabase
      .from('maintenance_schedule')
      .select('id, service_type, interval_hours, interval_months, active')
      .eq('boat_id', membership.boatId)
      .order('service_type'),
    supabase
      .from('maintenance_log')
      .select('id, service_date, service_type, engine_hours_at_service, cost, notes')
      .eq('boat_id', membership.boatId)
      .order('service_date', { ascending: false }),
    getCurrentEngineHours(membership.boatId),
  ])

  const items = computeDueStatus(schedules ?? [], log ?? [], currentHours, new Date())
  const serviceTypes = (schedules ?? []).map((row) => row.service_type)
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

      <div>
        <Annotation>Schedule</Annotation>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item.serviceType}>
              <Card className="flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{item.serviceType}</span>
                  <Pill tone={item.status}>{item.status}</Pill>
                </div>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  <dt className="opacity-60">Last done</dt>
                  <dd className="readout">
                    {item.lastServiceDate ? shortDate(item.lastServiceDate) : 'Never'}
                  </dd>
                  <dt className="opacity-60">Due at</dt>
                  <dd className="readout">
                    {item.dueAtHours !== null ? `${item.dueAtHours} h` : '—'}
                  </dd>
                  <dt className="opacity-60">Due by</dt>
                  <dd className="readout">
                    {item.dueOnDate ? shortDate(item.dueOnDate) : '—'}
                  </dd>
                </dl>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      {isCrew ? (
        <Card className="flex flex-col gap-4">
          <Annotation>Log a service</Annotation>
          <ServiceForm serviceTypes={serviceTypes} currentHours={currentHours} />
        </Card>
      ) : null}

      <div>
        <Annotation>History</Annotation>
        {log && log.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {log.map((entry) => (
              <li key={entry.id}>
                <Card className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{entry.service_type}</span>
                    <span className="readout text-sm opacity-70">
                      {shortDate(entry.service_date)}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-x-5 text-sm">
                    <span>
                      <span className="opacity-60">At </span>
                      <Readout value={formatHours(entry.engine_hours_at_service)} unit="h" />
                    </span>
                    {entry.cost !== null ? (
                      <span>
                        <span className="opacity-60">Cost </span>
                        <Readout value={formatMoney(entry.cost)} />
                      </span>
                    ) : null}
                  </div>
                  {entry.notes ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">
                      {entry.notes}
                    </p>
                  ) : null}
                </Card>
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
