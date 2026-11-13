import { describe, expect, it } from 'vitest'
import { latestEngineHours, startHoursDefault } from './hours'

describe('latestEngineHours', () => {
  it('takes the higher of the last trip and the last service', () => {
    expect(latestEngineHours(1234.5, 1240)).toBe(1240)
    expect(latestEngineHours(1250.2, 1240)).toBe(1250.2)
  })

  it('uses whichever source has a reading', () => {
    expect(latestEngineHours(null, 1240)).toBe(1240)
    expect(latestEngineHours(1234.5, null)).toBe(1234.5)
  })

  it('is null when nothing has been logged', () => {
    expect(latestEngineHours(null, null)).toBeNull()
    expect(latestEngineHours()).toBeNull()
    expect(latestEngineHours(undefined)).toBeNull()
  })

  it('ignores readings that cannot be real', () => {
    expect(latestEngineHours(Number.NaN, -5, 812)).toBe(812)
  })

  it('treats zero as a reading, not as nothing', () => {
    expect(latestEngineHours(0, null)).toBe(0)
  })
})

describe('startHoursDefault', () => {
  it('prefills a new trip with the current hours', () => {
    expect(
      startHoursDefault({ isNewTrip: true, saved: undefined, draft: undefined, current: 1234.5 }),
    ).toBe('1234.5')
  })

  it('leaves a new trip blank when there is no reading yet', () => {
    expect(
      startHoursDefault({ isNewTrip: true, saved: undefined, draft: undefined, current: null }),
    ).toBe('')
  })

  it('never overwrites an existing trip, even a blank one', () => {
    expect(
      startHoursDefault({ isNewTrip: false, saved: '1100', draft: undefined, current: 1234.5 }),
    ).toBe('1100')
    expect(
      startHoursDefault({ isNewTrip: false, saved: undefined, draft: undefined, current: 1234.5 }),
    ).toBe('')
  })

  it('lets a restored draft win over the prefill', () => {
    expect(
      startHoursDefault({ isNewTrip: true, saved: undefined, draft: '1229', current: 1234.5 }),
    ).toBe('1229')
  })

  it('lets a restored draft win over the saved value when editing', () => {
    expect(
      startHoursDefault({ isNewTrip: false, saved: '1100', draft: '1101', current: 1234.5 }),
    ).toBe('1101')
  })

  it('keeps an edit draft that emptied the field, as the rest of the form does', () => {
    expect(
      startHoursDefault({ isNewTrip: false, saved: '1100', draft: '', current: 1234.5 }),
    ).toBe('')
  })

  it('falls back to the prefill when a new-trip draft left the field empty', () => {
    expect(
      startHoursDefault({ isNewTrip: true, saved: undefined, draft: '  ', current: 1234.5 }),
    ).toBe('1234.5')
  })
})
