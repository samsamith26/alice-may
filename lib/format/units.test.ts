import { describe, expect, it } from 'vitest'
import { cToF, compassPoint, formatHours, metersToFeet, msToKnots } from './units'

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
