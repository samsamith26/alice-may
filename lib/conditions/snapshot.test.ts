import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { assembleSnapshot, pickHourIndex, summarise } from './snapshot'
import type { SnapshotInput } from './types'

// Real payloads captured from the live APIs. A fixture invented by the same
// person who wrote the parser only proves the parser agrees with its author.
const marine = JSON.parse(readFileSync('test/fixtures/marine.json', 'utf8'))
const weather = JSON.parse(readFileSync('test/fixtures/weather.json', 'utf8'))
const tides = JSON.parse(readFileSync('test/fixtures/tides.json', 'utf8'))

const input: SnapshotInput = {
  date: '2026-07-01',
  time: '09:00',
  lat: 36.6045,
  lng: -121.8918,
  tideStationId: '9413450',
}

describe('pickHourIndex', () => {
  it('picks the hour nearest the departure time', () => {
    expect(pickHourIndex(marine.hourly.time, '2026-07-01', '09:00')).toBe(9)
  })

  it('rounds to the nearest hour', () => {
    expect(pickHourIndex(marine.hourly.time, '2026-07-01', '09:40')).toBe(10)
  })

  it('falls back to midday when no departure time was recorded', () => {
    expect(pickHourIndex(marine.hourly.time, '2026-07-01', null)).toBe(12)
  })

  it('falls back to the first hour when the date is not in the payload', () => {
    expect(pickHourIndex(marine.hourly.time, '2020-01-01', '09:00')).toBe(0)
  })
})

describe('assembleSnapshot', () => {
  it('produces a complete snapshot from real API payloads', () => {
    const snap = assembleSnapshot(
      { marine, weather, tides, weatherEndpoint: 'archive' },
      input,
    )

    expect(snap.version).toBe(1)
    expect(snap.at_hour).toBe('2026-07-01T09:00')
    expect(snap.waves.height_ft).toBeGreaterThan(0)
    expect(snap.wind.speed_kn).not.toBeNull()
    expect(snap.wind.dir_deg).toBe(247)
    expect(snap.tides).toHaveLength(4)
    expect(snap.tides[0].type).toBe('L')
    expect(snap.tides[0].height_ft).toBeCloseTo(-0.71, 2)
    expect(snap.sources).toEqual({
      marine: true,
      weather: true,
      tides: true,
      weather_endpoint: 'archive',
    })
  })

  it('converts sea surface temperature from celsius even under imperial units', () => {
    const snap = assembleSnapshot(
      { marine, weather, tides, weatherEndpoint: 'archive' },
      input,
    )
    const rawC = marine.hourly.sea_surface_temperature[9] as number

    expect(snap.sst_f).toBeCloseTo((rawC * 9) / 5 + 32, 1)
    // Monterey Bay is cold, but it is not near-freezing: a missed conversion
    // would leave this in the teens.
    expect(snap.sst_f!).toBeGreaterThan(40)
  })

  it('degrades to nulls when marine data is missing, keeping what did arrive', () => {
    const snap = assembleSnapshot(
      { marine: null, weather, tides, weatherEndpoint: 'archive' },
      input,
    )

    expect(snap.waves.height_ft).toBeNull()
    expect(snap.swell.height_ft).toBeNull()
    expect(snap.sst_f).toBeNull()
    expect(snap.sources.marine).toBe(false)
    expect(snap.wind.speed_kn).not.toBeNull()
  })

  it('survives every source being absent without throwing', () => {
    const snap = assembleSnapshot(
      { marine: null, weather: null, tides: null, weatherEndpoint: null },
      input,
    )

    expect(snap.tides).toEqual([])
    expect(snap.wind.speed_kn).toBeNull()
    expect(snap.summary).toBe('No conditions recorded')
  })

  it('ignores a tide row whose height is not a number', () => {
    const snap = assembleSnapshot(
      {
        marine,
        weather,
        tides: { predictions: [{ t: '2026-07-01 13:45', v: 'x', type: 'H' }] },
        weatherEndpoint: 'archive',
      },
      input,
    )
    expect(snap.tides).toEqual([])
  })
})

describe('summarise', () => {
  it('reads as one glanceable line', () => {
    expect(
      summarise({
        wind: { speed_kn: 12, dir_deg: 315, gust_kn: 18 },
        waves: { height_ft: 3, period_s: 9, dir_deg: 290 },
        tides: [{ time: '2026-07-01T14:14', height_ft: 3.7, type: 'H' }],
      }),
    ).toBe('12kt NW · 3ft @ 9s · high 2:14pm')
  })

  it('omits clauses whose data is missing rather than printing blanks', () => {
    expect(
      summarise({
        wind: { speed_kn: 8, dir_deg: 180, gust_kn: null },
        waves: { height_ft: null, period_s: null, dir_deg: null },
        tides: [],
      }),
    ).toBe('8kt S')
  })
})
