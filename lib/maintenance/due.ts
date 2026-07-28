/**
 * Maintenance due dates. Pure — no database access.
 *
 * One rule, applied to everything: last done plus the interval, computed fresh
 * every time. A schedule row can carry an hour interval, a time interval, or
 * both, and the earlier of the two wins — oil is measured in hours, impellers
 * in seasons, and a boat that sat on a mooring all summer still needs its
 * zincs. Rent is the same idea on a longer scale.
 *
 * Nothing is ever set by hand. Changing an interval is the only way the
 * schedule moves, which means what a card shows can always be derived from the
 * interval and the log, and never disagrees with them.
 *
 * `category` only decides which group an item appears under on the page.
 */

export type ServiceCategory = 'mechanical' | 'bill'

export type IntervalUnit = 'day' | 'week' | 'month' | 'year'

/**
 * Interval fields are optional because an unset interval is a real state, not
 * missing data: spark plugs are counted in hours and have no calendar life.
 * Rows read from the database always carry them all.
 */
export type ScheduleRow = {
  id?: string
  service_type: string
  category?: ServiceCategory | null
  interval_hours: number | null
  interval_count?: number | null
  interval_unit?: IntervalUnit | null
  active: boolean
}

export type LogRow = {
  service_type: string
  service_date: string
  engine_hours_at_service: number | null
}

export type DueStatus = 'ok' | 'soon' | 'overdue'

export type DueItem = {
  scheduleId: string | null
  serviceType: string
  category: ServiceCategory
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

/** Day 0 of the next month is the last day of this one. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * Add whole months, clamping rather than overflowing. Plain month arithmetic
 * turns 31 January plus a month into 3 March, which would quietly move a
 * service date into the wrong month.
 */
function addMonths(date: Date, months: number): Date {
  const day = date.getUTCDate()
  const result = new Date(date)
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  result.setUTCDate(
    Math.min(day, daysInMonth(result.getUTCFullYear(), result.getUTCMonth())),
  )
  return result
}

export function addInterval(iso: string, count: number, unit: IntervalUnit): string {
  const date = new Date(`${iso}T12:00:00Z`)

  switch (unit) {
    case 'day':
      date.setUTCDate(date.getUTCDate() + count)
      return date.toISOString().slice(0, 10)
    case 'week':
      date.setUTCDate(date.getUTCDate() + count * 7)
      return date.toISOString().slice(0, 10)
    case 'month':
      return addMonths(date, count).toISOString().slice(0, 10)
    case 'year':
      return addMonths(date, count * 12).toISOString().slice(0, 10)
  }
}

function daysBetween(fromIso: string, to: Date): number {
  const from = Date.parse(`${fromIso}T12:00:00Z`)
  return Math.round((from - to.getTime()) / 86_400_000)
}

function computeItem(
  schedule: ScheduleRow,
  log: LogRow[],
  currentEngineHours: number | null,
  today: Date,
): DueItem {
  const history = log
    .filter((entry) => entry.service_type === schedule.service_type)
    .sort((a, b) => b.service_date.localeCompare(a.service_date))

  const last = history[0] ?? null

  const count = schedule.interval_count ?? null
  const unit = schedule.interval_unit ?? null

  const dueAtHours =
    last && schedule.interval_hours !== null && last.engine_hours_at_service !== null
      ? last.engine_hours_at_service + schedule.interval_hours
      : null

  const dueOnDate =
    last && count !== null && unit !== null
      ? addInterval(last.service_date, count, unit)
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

  // Nothing to measure against: never logged, so there is no "last done" to add
  // the interval to. An unserviced 2009 engine is not "ok" just because there
  // is no record of it, and an unpaid bill is not settled by silence.
  const undated = dueAtHours === null && dueOnDate === null

  return {
    scheduleId: schedule.id ?? null,
    serviceType: schedule.service_type,
    category: schedule.category ?? 'mechanical',
    lastServiceDate: last?.service_date ?? null,
    lastServiceHours: last?.engine_hours_at_service ?? null,
    dueAtHours,
    dueOnDate,
    hoursRemaining,
    daysRemaining,
    status: undated || overdue ? 'overdue' : soon ? 'soon' : 'ok',
  }
}

export function computeDueStatus(
  schedules: ScheduleRow[],
  log: LogRow[],
  currentEngineHours: number | null,
  today: Date,
): DueItem[] {
  return schedules
    .filter((schedule) => schedule.active)
    .map((schedule) => computeItem(schedule, log, currentEngineHours, today))
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.serviceType.localeCompare(b.serviceType),
    )
}
