export type TideExtreme = {
  time: string
  height_ft: number
  type: 'H' | 'L'
}

export type WeatherEndpoint = 'archive' | 'forecast'

export type ConditionsStatus = 'pending' | 'ok' | 'partial' | 'failed'

/**
 * A permanent record of the conditions at a trip, frozen at save time.
 *
 * Versioned because forecast and reanalysis models change: a snapshot written
 * today must stay readable after the shape evolves, so readers branch on
 * `version` rather than guessing.
 */
export type ConditionsSnapshot = {
  version: 1
  captured_at: string
  location: { lat: number; lng: number }
  at_hour: string | null
  wind: {
    speed_kn: number | null
    dir_deg: number | null
    gust_kn: number | null
  }
  waves: {
    height_ft: number | null
    period_s: number | null
    dir_deg: number | null
  }
  swell: {
    height_ft: number | null
    period_s: number | null
    dir_deg: number | null
  }
  sst_f: number | null
  air_temp_f: number | null
  pressure_hpa: number | null
  tides: TideExtreme[]
  sources: {
    marine: boolean
    weather: boolean
    tides: boolean
    weather_endpoint: WeatherEndpoint | null
  }
  summary: string
}

export type SnapshotInput = {
  date: string
  time: string | null
  lat: number
  lng: number
  tideStationId: string
}

/** Shape of an Open-Meteo hourly payload, as far as this app relies on it. */
export type HourlyPayload = {
  hourly?: Record<string, Array<number | null> | string[]>
} | null

export type TidePayload = {
  predictions?: Array<{ t: string; v: string; type: string }>
} | null
