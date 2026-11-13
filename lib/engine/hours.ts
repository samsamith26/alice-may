/** Engine-hour readings. Pure — no database access, no imports. */

function isReading(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

/**
 * The engine's current hours: the highest reading anywhere it gets written
 * down. The meter only counts up, so the largest figure is the latest one —
 * whether it came off the end of a trip or off a service entry logged after
 * a run with no trip behind it. Null when nothing has been logged.
 */
export function latestEngineHours(
  ...readings: Array<number | null | undefined>
): number | null {
  const valid = readings.filter(isReading)
  return valid.length === 0 ? null : Math.max(...valid)
}

/**
 * What "Hours at start" opens with on the trip form.
 *
 * An existing trip behaves exactly as the rest of the form does: a restored
 * draft's value (even an emptied field) over the saved one, and never
 * today's meter, which would rewrite history. A new trip takes a draft's
 * value when it has one, and otherwise starts from the current reading.
 */
export function startHoursDefault({
  isNewTrip,
  saved,
  draft,
  current,
}: {
  isNewTrip: boolean
  saved: string | null | undefined
  draft: string | null | undefined
  current: number | null
}): string {
  if (!isNewTrip) return draft ?? saved ?? ''
  if (draft !== null && draft !== undefined && draft.trim() !== '') return draft
  return current === null ? '' : String(current)
}
