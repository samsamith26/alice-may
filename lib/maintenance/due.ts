/**
 * Maintenance due dates. Pure — no database access.
 *
 * Two rules, because the two kinds of item genuinely work differently.
 *
 * Interval — last done plus an hour interval, a time interval, or both,
 * whichever comes first. Oil is measured in hours, impellers in seasons, and a
 * boat that sat on a mooring all summer still needs its zincs. A service is a
 * reaction to the last one, so the date moving with it is correct.
 *
 * Fixed annual — the same calendar date every year. Rent falls due on 1 July
 * because the harbour says so, and paying it late does not move next year's
 * date. Running a bill through the interval maths would let it drift a little
 * further every time a payment slipped.
 *
 * Nothing is ever set by hand under either rule. Changing the schedule is the
 * only way a due point moves, so what a card shows can always be derived from
 * the schedule and the log, and never disagrees with them.
 *
 * A row picks its rule by carrying an annual date or not. Bills are the only
 * rows that do, which the database enforces.
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
  /** Fixed annual recurrence. Both set or both null. */
  annual_due_month?: number | null
  annual_due_day?: number | null
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

/**
 * How far ahead of a fixed annual date a payment still counts as settling it.
 * Wide enough for the usual fortnight or month of lead time, narrow enough that
 * a payment a season early cannot be mistaken for next year's.
 */
const EARLY_PAYMENT_WINDOW_DAYS = 60

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

function daysApart(fromIso: string, toIso: string): number {
  return Math.round(
    (Date.parse(`${toIso}T12:00:00Z`) - Date.parse(`${fromIso}T12:00:00Z`)) /
      86_400_000,
  )
}

/** The fixed date as it falls in one particular year, clamped to a short month. */
function occurrence(year: number, month: number, day: number): string {
  const clamped = Math.min(day, daysInMonth(year, month - 1))
  return `${year}-${String(month).padStart(2, '0')}-${String(clamped).padStart(2, '0')}`
}

/**
 * Which year's bill a payment settles.
 *
 * Bills get paid before the date on the invoice — rent a fortnight early, a tax
 * bill the week it arrives. So a payment shortly before an occurrence settles
 * that occurrence, not the one a year behind it. Outside that window it belongs
 * to the occurrence that had already passed when it was made, which is what
 * keeps a skipped year visible.
 */
function cycleSettledBy(paymentIso: string, month: number, day: number): string {
  const year = Number(paymentIso.slice(0, 4))
  const thisYear = occurrence(year, month, day)

  const upcoming = thisYear >= paymentIso ? thisYear : occurrence(year + 1, month, day)
  if (daysApart(paymentIso, upcoming) <= EARLY_PAYMENT_WINDOW_DAYS) return upcoming

  return thisYear <= paymentIso ? thisYear : occurrence(year - 1, month, day)
}

/**
 * When a fixed-annual item is next due.
 *
 * Measured against the cycle currently in force — the most recent occurrence of
 * the date that has already arrived. Settling that cycle shows the next
 * occurrence of the same date; leaving it unsettled leaves the item sitting on
 * a date in the past, which is what makes it overdue. The date itself is never
 * recalculated from when the payment landed.
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
  const currentCycle = thisYear <= todayIso ? thisYear : occurrence(year - 1, month, day)

  if (lastServiceDate !== null) {
    const settled = cycleSettledBy(lastServiceDate, month, day)
    if (settled >= currentCycle) {
      return occurrence(Number(settled.slice(0, 4)) + 1, month, day)
    }
  }
  return currentCycle
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
  const month = schedule.annual_due_month ?? null
  const day = schedule.annual_due_day ?? null
  const isAnnual = month !== null && day !== null

  const dueAtHours =
    last && schedule.interval_hours !== null && last.engine_hours_at_service !== null
      ? last.engine_hours_at_service + schedule.interval_hours
      : null

  // A fixed date is known without any history at all, which is the point of it:
  // rent is due on 1 July whether or not anything was ever logged.
  const dueOnDate = isAnnual
    ? annualDueDate(month, day, last?.service_date ?? null, today)
    : last && count !== null && unit !== null
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
