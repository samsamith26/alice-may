import { cToF, compassPoint } from '@/lib/format/units'
import { chooseWeatherEndpoint, fetchMarine, fetchWeather } from './open-meteo'
import { fetchObservedWaterTempF, fetchTides } from './noaa'
import type {
  ConditionsSnapshot,
  ConditionsStatus,
  HourlyPayload,
  SnapshotInput,
  TideExtreme,
  TidePayload,
  WeatherEndpoint,
} from './types'

const DEFAULT_HOUR = 12

type RawPayloads = {
  marine: HourlyPayload
  weather: HourlyPayload
  tides: TidePayload
  weatherEndpoint: WeatherEndpoint | null
  observedWaterTempF?: number | null
}

/**
 * Index of the hourly reading nearest a departure time.
 *
 * Falls back to midday when no time was logged — a trip with no departure time
 * is almost always a day trip, and midday conditions describe it better than
 * midnight would.
 */
export function pickHourIndex(
  times: string[] | undefined,
  date: string,
  time: string | null,
): number {
  if (!times || times.length === 0) return 0

  let hour = DEFAULT_HOUR
  if (time) {
    const [rawHours, rawMinutes] = time.split(':').map(Number)
    if (Number.isFinite(rawHours)) {
      const rounded = rawHours + (Number.isFinite(rawMinutes) && rawMinutes >= 30 ? 1 : 0)
      hour = Math.min(23, Math.max(0, rounded))
    }
  }

  const target = `${date}T${String(hour).padStart(2, '0')}:00`
  const index = times.indexOf(target)
  return index >= 0 ? index : 0
}

function numberAt(
  payload: HourlyPayload,
  key: string,
  index: number,
): number | null {
  const series = payload?.hourly?.[key]
  if (!Array.isArray(series)) return null
  const value = series[index]
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function parseTides(payload: TidePayload): TideExtreme[] {
  const predictions = payload?.predictions
  if (!Array.isArray(predictions)) return []

  return predictions.flatMap((row) => {
    const height = Number(row.v)
    if (!Number.isFinite(height)) return []
    if (row.type !== 'H' && row.type !== 'L') return []
    return [
      {
        time: row.t.replace(' ', 'T'),
        height_ft: height,
        type: row.type,
      },
    ]
  })
}

function clockTime(isoish: string): string {
  const timePart = isoish.split('T')[1] ?? ''
  const [rawHours, minutes] = timePart.split(':')
  const hours = Number(rawHours)
  if (!Number.isFinite(hours)) return isoish

  const suffix = hours >= 12 ? 'pm' : 'am'
  const display = hours % 12 === 0 ? 12 : hours % 12
  return `${display}:${minutes}${suffix}`
}

/** One glanceable line: "12kt NW · 3ft @ 9s · high 2:14pm". */
export function summarise(parts: {
  wind: { speed_kn: number | null; dir_deg: number | null; gust_kn: number | null }
  waves: { height_ft: number | null; period_s: number | null; dir_deg: number | null }
  tides: TideExtreme[]
}): string {
  const clauses: string[] = []

  if (parts.wind.speed_kn !== null) {
    const direction =
      parts.wind.dir_deg !== null ? ` ${compassPoint(parts.wind.dir_deg)}` : ''
    clauses.push(`${Math.round(parts.wind.speed_kn)}kt${direction}`)
  }

  if (parts.waves.height_ft !== null) {
    const period =
      parts.waves.period_s !== null ? ` @ ${Math.round(parts.waves.period_s)}s` : ''
    clauses.push(`${Math.round(parts.waves.height_ft)}ft${period}`)
  }

  const nextHigh = parts.tides.find((tide) => tide.type === 'H')
  if (nextHigh) {
    clauses.push(`high ${clockTime(nextHigh.time)}`)
  }

  return clauses.length > 0 ? clauses.join(' · ') : 'No conditions recorded'
}

/**
 * The pure half: turn already-fetched payloads into a snapshot. Never throws
 * on missing data — an absent source becomes nulls and a false `sources` flag,
 * so a partial record is still a record.
 */
export function assembleSnapshot(
  raw: RawPayloads,
  input: SnapshotInput,
): ConditionsSnapshot {
  const marineTimes = raw.marine?.hourly?.time as string[] | undefined
  const weatherTimes = raw.weather?.hourly?.time as string[] | undefined

  const marineIndex = pickHourIndex(marineTimes, input.date, input.time)
  const weatherIndex = pickHourIndex(weatherTimes, input.date, input.time)

  const atHour =
    marineTimes?.[marineIndex] ?? weatherTimes?.[weatherIndex] ?? null

  const wind = {
    speed_kn: numberAt(raw.weather, 'wind_speed_10m', weatherIndex),
    dir_deg: numberAt(raw.weather, 'wind_direction_10m', weatherIndex),
    gust_kn: numberAt(raw.weather, 'wind_gusts_10m', weatherIndex),
  }

  const waves = {
    height_ft: numberAt(raw.marine, 'wave_height', marineIndex),
    period_s: numberAt(raw.marine, 'wave_period', marineIndex),
    dir_deg: numberAt(raw.marine, 'wave_direction', marineIndex),
  }

  const swell = {
    height_ft: numberAt(raw.marine, 'swell_wave_height', marineIndex),
    period_s: numberAt(raw.marine, 'swell_wave_period', marineIndex),
    dir_deg: numberAt(raw.marine, 'swell_wave_direction', marineIndex),
  }

  // sea_surface_temperature is returned in celsius even when length_unit is
  // imperial, so this conversion is not optional.
  const sstC = numberAt(raw.marine, 'sea_surface_temperature', marineIndex)
  const sstF = sstC !== null ? cToF(sstC) : (raw.observedWaterTempF ?? null)

  const tides = parseTides(raw.tides)

  return {
    version: 1,
    captured_at: new Date().toISOString(),
    location: { lat: input.lat, lng: input.lng },
    at_hour: atHour,
    wind,
    waves,
    swell,
    sst_f: sstF,
    air_temp_f: numberAt(raw.weather, 'temperature_2m', weatherIndex),
    pressure_hpa: numberAt(raw.weather, 'pressure_msl', weatherIndex),
    tides,
    sources: {
      marine: raw.marine !== null,
      weather: raw.weather !== null,
      tides: raw.tides !== null,
      weather_endpoint: raw.weatherEndpoint,
    },
    summary: summarise({ wind, waves, tides }),
  }
}

/**
 * Fetch every source in parallel and freeze the result.
 *
 * Returns a status rather than throwing, because the caller's job — saving a
 * trip — must succeed whether or not a weather service is reachable.
 */
export async function buildSnapshot(input: SnapshotInput): Promise<{
  snapshot: ConditionsSnapshot | null
  status: Extract<ConditionsStatus, 'ok' | 'partial' | 'failed'>
}> {
  const endpoint = chooseWeatherEndpoint(input.date, new Date())

  const [marine, weather, tides] = await Promise.all([
    fetchMarine(input.lat, input.lng, input.date),
    fetchWeather(input.lat, input.lng, input.date, endpoint),
    fetchTides(input.tideStationId, input.date),
  ])

  if (marine === null && weather === null && tides === null) {
    return { snapshot: null, status: 'failed' }
  }

  // Only reach for the observed reading when the model has nothing for the
  // hour actually being recorded. Checking whether the whole day is null would
  // skip the fallback whenever the model covers most of the day but happens to
  // stop short of this trip's departure hour — which is exactly when the
  // fallback is wanted, since per-variable forecast horizons differ.
  const marineTimes = marine?.hourly?.time as string[] | undefined
  const marineIndex = pickHourIndex(marineTimes, input.date, input.time)
  const modelledSst = marine?.hourly?.sea_surface_temperature
  const sstAtHour = Array.isArray(modelledSst) ? modelledSst[marineIndex] : null
  const observedWaterTempF =
    typeof sstAtHour === 'number' && Number.isFinite(sstAtHour)
      ? null
      : await fetchObservedWaterTempF(input.tideStationId, input.date)

  const snapshot = assembleSnapshot(
    { marine, weather, tides, weatherEndpoint: endpoint, observedWaterTempF },
    input,
  )

  const complete = marine !== null && weather !== null && tides !== null
  return { snapshot, status: complete ? 'ok' : 'partial' }
}
