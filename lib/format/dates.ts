/** Calendar-date helpers. Pure — no I/O. */

export const BOAT_TIMEZONE = 'America/Los_Angeles'

/**
 * The calendar date in a given timezone, as YYYY-MM-DD.
 *
 * `new Date().toISOString().slice(0, 10)` gives the UTC date, which is wrong
 * for anything user-facing here: the server runs in UTC, so from about 5pm
 * Pacific onwards it already reports tomorrow. A tide table that labels
 * tomorrow as "Today" is worse than no tide table.
 */
export function todayInZone(now: Date, timeZone: string = BOAT_TIMEZONE): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/** Adds whole days to a YYYY-MM-DD string without tripping over DST. */
export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}
