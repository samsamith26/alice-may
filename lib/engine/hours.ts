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
