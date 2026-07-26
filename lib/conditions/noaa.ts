import type { TidePayload } from './types'

const DATAGETTER = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter'
const APPLICATION = 'alice-may-logbook'
const TIMEOUT_MS = 8000

/** NOAA wants YYYYMMDD, not ISO. */
function compact(date: string): string {
  return date.replaceAll('-', '')
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    const body = (await response.json()) as T & { error?: unknown }
    // CO-OPS answers some bad requests with 200 and an { error } body.
    if (body && typeof body === 'object' && 'error' in body && body.error) {
      return null
    }
    return body
  } catch {
    return null
  }
}

/** High and low water for a station on a date. */
export async function fetchTides(
  stationId: string,
  date: string,
  endDate: string = date,
): Promise<TidePayload> {
  const params = new URLSearchParams({
    product: 'predictions',
    application: APPLICATION,
    begin_date: compact(date),
    end_date: compact(endDate),
    datum: 'MLLW',
    station: stationId,
    time_zone: 'lst_ldt',
    units: 'english',
    interval: 'hilo',
    format: 'json',
  })
  return getJson<NonNullable<TidePayload>>(`${DATAGETTER}?${params}`)
}

/**
 * Observed water temperature in °F — a real measurement, unlike Open-Meteo's
 * modelled SST. Used as a fallback when the model has no value.
 */
export async function fetchObservedWaterTempF(
  stationId: string,
  date: string,
): Promise<number | null> {
  const params = new URLSearchParams({
    product: 'water_temperature',
    application: APPLICATION,
    begin_date: compact(date),
    end_date: compact(date),
    station: stationId,
    time_zone: 'lst_ldt',
    units: 'english',
    format: 'json',
  })

  const body = await getJson<{ data?: Array<{ v: string }> }>(
    `${DATAGETTER}?${params}`,
  )
  const readings = body?.data ?? []
  if (readings.length === 0) return null

  const values = readings
    .map((row) => Number(row.v))
    .filter((value) => Number.isFinite(value))
  if (values.length === 0) return null

  return values.reduce((sum, value) => sum + value, 0) / values.length
}
