/**
 * Maintenance due dates. Pure — no database access.
 *
 * Every service is judged against both its hour interval and its calendar
 * interval, whichever falls due first. Oil is measured in hours, impellers in
 * seasons, and a boat that sat on a mooring all summer still needs its zincs.
 */

export type ScheduleRow = {
  service_type: string
  interval_hours: number | null
  interval_months: number | null
  active: boolean
}

export type LogRow = {
  service_type: string
  service_date: string
  engine_hours_at_service: number | null
}

export type DueStatus = 'ok' | 'soon' | 'overdue'

export type DueItem = {
  serviceType: string
  lastServiceDate: string | null
  lastServiceHours: number | null
  dueAtHours: number | null
  dueOnDate: string | null
  hoursRemaining: number | null
  daysRemaining: number | null
  status: DueStatus
}

/** Warn once within a tenth of the hour interval, or a month of the date. */
const HOURS_WARNING_FRACTION = 0.1
const DAYS_WARNING_WINDOW = 30

const STATUS_ORDER: Record<DueStatus, number> = { overdue: 0, soon: 1, ok: 2 }

function addMonths(iso: string, months: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  const targetMonth = date.getUTCMonth() + months
  const result = new Date(date)
  result.setUTCMonth(targetMonth)
  return result.toISOString().slice(0, 10)
}

function daysBetween(fromIso: string, to: Date): number {
  const from = Date.parse(`${fromIso}T12:00:00Z`)
  return Math.round((from - to.getTime()) / 86_400_000)
}

export function computeDueStatus(
  schedules: ScheduleRow[],
  log: LogRow[],
  currentEngineHours: number | null,
  today: Date,
): DueItem[] {
  const items = schedules
    .filter((schedule) => schedule.active)
    .map((schedule): DueItem => {
      const history = log
        .filter((entry) => entry.service_type === schedule.service_type)
        .sort((a, b) => b.service_date.localeCompare(a.service_date))

      const last = history[0] ?? null

      if (!last) {
        return {
          serviceType: schedule.service_type,
          lastServiceDate: null,
          lastServiceHours: null,
          dueAtHours: null,
          dueOnDate: null,
          hoursRemaining: null,
          daysRemaining: null,
          status: 'overdue',
        }
      }

      const dueAtHours =
        schedule.interval_hours !== null && last.engine_hours_at_service !== null
          ? last.engine_hours_at_service + schedule.interval_hours
          : null

      const dueOnDate =
        schedule.interval_months !== null
          ? addMonths(last.service_date, schedule.interval_months)
          : null

      const hoursRemaining =
        dueAtHours !== null && currentEngineHours !== null
          ? dueAtHours - currentEngineHours
          : null

      const daysRemaining = dueOnDate !== null ? daysBetween(dueOnDate, today) : null

      const overdue =
        (hoursRemaining !== null && hoursRemaining < 0) ||
        (daysRemaining !== null && daysRemaining < 0)

      const soon =
        (hoursRemaining !== null &&
          schedule.interval_hours !== null &&
          hoursRemaining <= schedule.interval_hours * HOURS_WARNING_FRACTION) ||
        (daysRemaining !== null && daysRemaining <= DAYS_WARNING_WINDOW)

      return {
        serviceType: schedule.service_type,
        lastServiceDate: last.service_date,
        lastServiceHours: last.engine_hours_at_service,
        dueAtHours,
        dueOnDate,
        hoursRemaining,
        daysRemaining,
        status: overdue ? 'overdue' : soon ? 'soon' : 'ok',
      }
    })

  return items.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      a.serviceType.localeCompare(b.serviceType),
  )
}
