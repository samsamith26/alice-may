import { describe, expect, it } from 'vitest'
import { extent, linearScale, niceTicks } from './scale'

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const scale = linearScale([0, 10], [0, 100])
    expect(scale(0)).toBe(0)
    expect(scale(5)).toBe(50)
    expect(scale(10)).toBe(100)
  })

  it('inverts for SVG y-axes, where the range runs downward', () => {
    const scale = linearScale([0, 10], [200, 0])
    expect(scale(0)).toBe(200)
    expect(scale(10)).toBe(0)
  })

  it('does not divide by zero on a flat domain', () => {
    const scale = linearScale([5, 5], [0, 100])
    expect(Number.isFinite(scale(5))).toBe(true)
  })
})

describe('niceTicks', () => {
  it('produces round numbers covering the range', () => {
    const ticks = niceTicks(0, 97, 5)
    expect(ticks[0]).toBeLessThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97)
    expect(ticks.every(Number.isFinite)).toBe(true)
  })

  it('handles a zero-width range without looping forever', () => {
    const ticks = niceTicks(4, 4, 5)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.length).toBeLessThan(100)
  })

  it('survives non-finite input', () => {
    expect(niceTicks(Number.NaN, 10, 5)).toEqual([0, 1])
  })

  it('handles fractional ranges like nm per gallon', () => {
    const ticks = niceTicks(1.2, 2.8, 4)
    expect(ticks[0]).toBeLessThanOrEqual(1.2)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(2.8)
  })
})

describe('extent', () => {
  it('returns min and max', () => {
    expect(extent([3, 1, 4, 1, 5])).toEqual([1, 5])
  })

  it('has a usable default when there is no data', () => {
    expect(extent([])).toEqual([0, 1])
  })
})
