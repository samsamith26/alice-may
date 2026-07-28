/** Unit conversion and display formatting. Pure — no imports, no I/O. */

const COMPASS_POINTS = [
  'N', 'NNE', 'NE', 'ENE',
  'E', 'ESE', 'SE', 'SSE',
  'S', 'SSW', 'SW', 'WSW',
  'W', 'WNW', 'NW', 'NNW',
] as const

export const EM_DASH = '—'

/** Statute miles per nautical mile. Matches the database generated column. */
export const NM_TO_STATUTE_MILES = 1.15078

export function nmToStatuteMiles(nm: number): number {
  return nm * NM_TO_STATUTE_MILES
}

export function statuteMilesToNm(miles: number): number {
  return miles / NM_TO_STATUTE_MILES
}

/**
 * Converts for display in a linked input, at the precision the field shows.
 *
 * Returns '' for anything unparseable so a half-typed value ('2.', '-') leaves
 * the other field blank rather than filling it with NaN.
 */
export function convertForField(
  raw: string,
  convert: (value: number) => number,
  decimals = 2,
): string {
  if (raw.trim() === '') return ''
  const parsed = Number(raw)
  if (!Number.isFinite(parsed)) return ''
  return String(Number(convert(parsed).toFixed(decimals)))
}

export function cToF(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

export function msToKnots(metresPerSecond: number): number {
  return metresPerSecond * 1.943844
}

export function metersToFeet(metres: number): number {
  return metres * 3.280839895
}

/** 16-point compass name for a bearing in degrees. Wraps and accepts negatives. */
export function compassPoint(degrees: number): string {
  const normalised = ((degrees % 360) + 360) % 360
  return COMPASS_POINTS[Math.round(normalised / 22.5) % 16]
}

function format(value: number | null | undefined, digits: number): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return EM_DASH
  }
  return value.toFixed(digits).replace(/\.0+$/, '')
}

export function formatHours(hours: number | null | undefined): string {
  return format(hours, 1)
}

export function formatDistance(nm: number | null | undefined): string {
  return format(nm, 1)
}

export function formatGallons(gal: number | null | undefined): string {
  return format(gal, 1)
}

export function formatFeet(feet: number | null | undefined): string {
  return format(feet, 1)
}

export function formatMoney(usd: number | null | undefined): string {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return EM_DASH
  return `$${usd.toFixed(2)}`
}

/** Rounds to whole knots — nobody reads wind speed to a decimal place. */
export function formatKnots(knots: number | null | undefined): string {
  if (knots === null || knots === undefined || !Number.isFinite(knots)) {
    return EM_DASH
  }
  return String(Math.round(knots))
}
