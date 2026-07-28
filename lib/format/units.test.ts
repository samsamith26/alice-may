import { describe, expect, it } from 'vitest'
import {
  cToF,
  compassPoint,
  convertForField,
  formatHours,
  metersToFeet,
  msToKnots,
  nmToStatuteMiles,
  statuteMilesToNm,
} from './units'

describe('unit conversions', () => {
  it('converts celsius to fahrenheit', () => {
    expect(cToF(0)).toBe(32)
    expect(Math.round(cToF(15.5) * 10) / 10).toBe(59.9)
  })

  it('converts metres per second to knots', () => {
    expect(Math.round(msToKnots(10) * 10) / 10).toBe(19.4)
  })

  it('converts metres to feet', () => {
    expect(Math.round(metersToFeet(1) * 100) / 100).toBe(3.28)
  })

  it('names 16 compass points and wraps past 360', () => {
    expect(compassPoint(0)).toBe('N')
    expect(compassPoint(315)).toBe('NW')
    expect(compassPoint(360)).toBe('N')
    expect(compassPoint(371)).toBe('N')
    expect(compassPoint(203)).toBe('SSW')
  })

  it('handles negative bearings', () => {
    expect(compassPoint(-45)).toBe('NW')
  })

  it('shows a dash rather than a zero for a missing value', () => {
    expect(formatHours(null)).toBe('—')
    expect(formatHours(4.5)).toBe('4.5')
  })
})

describe('nautical to statute miles', () => {
  it('converts each way', () => {
    expect(nmToStatuteMiles(24.5)).toBeCloseTo(28.194, 3)
    expect(statuteMilesToNm(28.2)).toBeCloseTo(24.505, 3)
  })

  it('round-trips without drift', () => {
    expect(statuteMilesToNm(nmToStatuteMiles(24.5))).toBeCloseTo(24.5, 10)
  })
})

describe('convertForField', () => {
  it('converts a typed value for the linked field', () => {
    expect(convertForField('24.5', nmToStatuteMiles)).toBe('28.19')
    expect(convertForField('28.2', statuteMilesToNm)).toBe('24.51')
  })

  it('leaves the other field blank while a value is half-typed', () => {
    // Without this, typing '2.' or '-' would fill the paired field with NaN.
    expect(convertForField('', nmToStatuteMiles)).toBe('')
    expect(convertForField('-', nmToStatuteMiles)).toBe('')
    expect(convertForField('abc', nmToStatuteMiles)).toBe('')
  })

  it('trims trailing zeroes rather than showing 28.10', () => {
    expect(convertForField('10', nmToStatuteMiles)).toBe('11.51')
    expect(convertForField('0', nmToStatuteMiles)).toBe('0')
  })
})
