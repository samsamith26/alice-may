import { describe, expect, it } from 'vitest'
import { chooseWeatherEndpoint } from './open-meteo'

const today = new Date('2026-07-26T12:00:00Z')

describe('chooseWeatherEndpoint', () => {
  it('uses the archive for trips well in the past', () => {
    expect(chooseWeatherEndpoint('2026-06-01', today)).toBe('archive')
    expect(chooseWeatherEndpoint('2019-08-14', today)).toBe('archive')
  })

  it('uses the forecast endpoint for a trip logged the same day', () => {
    // The archive lags: asking it for today returns a payload of nulls, which
    // reads as "there was no weather" instead of "ask somewhere else".
    expect(chooseWeatherEndpoint('2026-07-26', today)).toBe('forecast')
  })

  it('uses the forecast endpoint inside the archive lag window', () => {
    expect(chooseWeatherEndpoint('2026-07-23', today)).toBe('forecast')
  })

  it('switches to the archive just past the lag window', () => {
    expect(chooseWeatherEndpoint('2026-07-20', today)).toBe('archive')
  })

  it('uses the forecast endpoint for a future date, so tides can be planned', () => {
    expect(chooseWeatherEndpoint('2026-08-02', today)).toBe('forecast')
  })

  it('falls back to the forecast endpoint on an unparseable date', () => {
    expect(chooseWeatherEndpoint('not-a-date', today)).toBe('forecast')
  })
})
