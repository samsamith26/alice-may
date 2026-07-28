/**
 * Maintenance due dates. Pure — no database access.
 *
 * There are two ways a schedule row falls due, and a row picks one by what it
 * has set rather than by what it is called:
 *
 *   Interval — last done plus an hour interval, a month interval, or both,
 *   whichever comes first. Oil is measured in hours, impellers in seasons, and
 *   a boat that sat on a mooring all summer still needs its zincs.
 *
 *   Fixed annual — the same calendar date every year, regardless of when it was
 *   last done. Rent falls due on 1 July whether or not last July was paid, so
 *   pushing it through the interval maths would drift the date every year.
 *
 * `category` only decides which group an item appears under on the page. The
 * rule is chosen by whether annual_due_month/day are set, so the two stay
 * independent — a fixed-date mechanical item would work without further change.
 *
 * On top of either rule sits an optional manual override of the due point. It
 * is anchored to the last service date it was set against: once something newer
 * is logged the anchor stops matching and the override lapses, which is what
 * makes it a one-off exception rather than a permanent pin.
 */

export type ServiceCategory = 'mechanical' | 'bill'

/**
 * Fields beyond the service type are optional because an unset rule is a real
 * state, not missing data: a row with no annual date simply does not recur
 * annually. Rows read from the database always carry them all.
 */
export type ScheduleRow = {
  id?: string
  service_type: string
  category?: ServiceCategory | null
  interval_hours: number | null
  interval_months: number | null
  /** Fixed annual recurrence. Both set or both null. */
  annual_due_month?: number | null
  annual_due_day?: number | null
  due_at_hours_override?: number | null
  due_on_date_override?: string | null
  /** The last service date the override was set against. */
  override_anchor_date?: string | null
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
  /** True when a manual override is supplying one of the due values. */
  overridden: boolean
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

/** Day 0 of the next month is the last day of this one. */
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function occurrence(year: number, month: number, day: number): string {
  const clamped = Math.min(day, daysInMonth(year, month))
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

/**
 * When a fixed-annual item is next due.
 *
 * Works from the cycle currently in force — the most recent occurrence of the
 * date that has already arrived. Paying inside that cycle rolls the item on to
 * next year; not paying leaves it sitting on a date in the past, which is what
 * makes it overdue. A payment logged for an older cycle does not count, so a
 * year that was missed stays missed.
 *
 * ISO dates compare correctly as strings, so no parsing is needed.
 */
export function annualDueDate(
  month: number,
  day: number,
  lastServiceDate: string | null,
  today: Date,
): string {
  const todayIso = today.toISOString().slice(0, 10)
  const year = Number(todayIso.slice(0, 4))

  const thisYear = occurrence(year, month, day)
  const cycleStart = thisYear <= todayIso ? thisYear : occurrence(year - 1, month, day)

  if (lastServiceDate !== null && lastServiceDate >= cycleStart) {
    return occurrence(Number(cycleStart.slice(0, 4)) + 1, month, day)
  }
  return cycleStart
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
  const lastServiceDate = last?.service_date ?? null

  const month = schedule.annual_due_month ?? null
  const day = schedule.annual_due_day ?? null
  const isAnnual = month !== null && day !== null

  let baseDueAtHours: number | null = null
  let baseDueOnDate: string | null = null

  if (isAnnual) {
    baseDueOnDate = annualDueDate(month, day, lastServiceDate, today)
  } else if (last) {
    baseDueAtHours =
      schedule.interval_hours !== null && last.engine_hours_at_service !== null
        ? last.engine_hours_at_service + schedule.interval_hours
        : null

    baseDueOnDate =
      schedule.interval_months !== null
        ? addMonths(last.service_date, schedule.interval_months)
        : null
  }

  const hoursOverride = schedule.due_at_hours_override ?? null
  const dateOverride = schedule.due_on_date_override ?? null
  // A newer log entry than the one the override was set against retires it.
  const overrideApplies =
    (hoursOverride !== null || dateOverride !== null) &&
    (schedule.override_anchor_date ?? null) === lastServiceDate

  const dueAtHours = overrideApplies ? (hoursOverride ?? baseDueAtHours) : baseDueAtHours
  const dueOnDate = overrideApplies ? (dateOverride ?? baseDueOnDate) : baseDueOnDate

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

  // Nothing to judge against at all: an interval item that has never been
  // logged. An unserviced 2009 engine is not "ok" just because there is no
  // record of it.
  const undated = dueAtHours === null && dueOnDate === null

  return {
    scheduleId: schedule.id ?? null,
    serviceType: schedule.service_type,
    category: schedule.category ?? 'mechanical',
    lastServiceDate,
    lastServiceHours: last?.engine_hours_at_service ?? null,
    dueAtHours,
    dueOnDate,
    hoursRemaining,
    daysRemaining,
    overridden: overrideApplies,
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
