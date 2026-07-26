import type { HourlyPayload, WeatherEndpoint } from './types'

const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine'
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive'
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast'

const TIMEZONE = 'America/Los_Angeles'
const TIMEOUT_MS = 8000

const MARINE_HOURLY = [
  'wave_height',
  'wave_direction',
  'wave_period',
  'swell_wave_height',
  'swell_wave_direction',
  'swell_wave_period',
  'sea_surface_temperature',
].join(',')

const WEATHER_HOURLY = [
  'temperature_2m',
  'wind_speed_10m',
  'wind_direction_10m',
  'wind_gusts_10m',
  'pressure_msl',
].join(',')

/** Days before today after which the archive still has no data. */
const ARCHIVE_LAG_DAYS = 5

/**
 * The archive API lags by several days and answers a too-recent request with a
 * payload full of nulls rather than an error — which would look like "there
 * was no weather" instead of "ask somewhere else". The forecast endpoint
 * serves past days too, so recent trips go there.
 */
export function chooseWeatherEndpoint(date: string, today: Date): WeatherEndpoint {
  const requested = Date.parse(`${date}T12:00:00Z`)
  if (Number.isNaN(requested)) return 'forecast'

  const ageDays = (today.getTime() - requested) / 86_400_000
  return ageDays > ARCHIVE_LAG_DAYS ? 'archive' : 'forecast'
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    // A slow or broken third-party API must never hold a trip save open.
    return null
  }
}

export async function fetchMarine(
  lat: number,
  lng: number,
  date: string,
): Promise<HourlyPayload> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: date,
    end_date: date,
    hourly: MARINE_HOURLY,
    timezone: TIMEZONE,
    length_unit: 'imperial',
  })
  return getJson<NonNullable<HourlyPayload>>(`${MARINE_URL}?${params}`)
}

export async function fetchWeather(
  lat: number,
  lng: number,
  date: string,
  endpoint: WeatherEndpoint,
): Promise<HourlyPayload> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: date,
    end_date: date,
    hourly: WEATHER_HOURLY,
    timezone: TIMEZONE,
    wind_speed_unit: 'kn',
    temperature_unit: 'fahrenheit',
  })
  const base = endpoint === 'archive' ? ARCHIVE_URL : FORECAST_URL
  return getJson<NonNullable<HourlyPayload>>(`${base}?${params}`)
}
