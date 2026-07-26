import { describe, expect, it } from 'vitest'
import { gallonsPerHour, nmPerGallon, summariseFleet } from './derive'

describe('trip derivations', () => {
  it('computes nautical miles per gallon', () => {
    expect(nmPerGallon(26, 13)).toBe(2)
  })

  it('returns null rather than Infinity when no fuel was used', () => {
    expect(nmPerGallon(26, 0)).toBeNull()
    expect(nmPerGallon(26, null)).toBeNull()
    expect(nmPerGallon(null, 13)).toBeNull()
  })

  it('rejects a negative fuel figure instead of returning a negative rate', () => {
    expect(nmPerGallon(26, -3)).toBeNull()
  })

  it('computes gallons per hour', () => {
    expect(gallonsPerHour(13, 4)).toBe(3.25)
    expect(gallonsPerHour(13, 0)).toBeNull()
  })

  it('summarises a fleet of trips, ignoring null fields but counting every trip', () => {
    const result = summariseFleet([
      { hours_run: 4, distance_nm: 26, fuel_used_gal: 13, fuel_cost_usd: 70 },
      { hours_run: 2, distance_nm: null, fuel_used_gal: 7, fuel_cost_usd: null },
    ])
    expect(result.totalHours).toBe(6)
    expect(result.totalNm).toBe(26)
    expect(result.totalFuelGal).toBe(20)
    expect(result.totalCostUsd).toBe(70)
    expect(result.tripCount).toBe(2)
  })

  it('averages efficiency only over trips that measured both distance and fuel', () => {
    // One trip logged distance but never a fuel level; another logged fuel but
    // no distance. Dividing fleet totals would report 5/40 = 0.125 nm/gal,
    // a ratio of two numbers from different trips.
    const result = summariseFleet([
      { hours_run: 1, distance_nm: 5, fuel_used_gal: null, fuel_cost_usd: null },
      { hours_run: 4, distance_nm: null, fuel_used_gal: 40, fuel_cost_usd: null },
      { hours_run: 2, distance_nm: 20, fuel_used_gal: 10, fuel_cost_usd: null },
    ])
    expect(result.avgNmPerGal).toBe(2)
    // The raw totals still count everything that was logged.
    expect(result.totalNm).toBe(25)
    expect(result.totalFuelGal).toBe(50)
  })

  it('has no efficiency figure when no trip measured both', () => {
    expect(
      summariseFleet([
        { hours_run: 1, distance_nm: 5, fuel_used_gal: null, fuel_cost_usd: null },
        { hours_run: 4, distance_nm: null, fuel_used_gal: 40, fuel_cost_usd: null },
      ]).avgNmPerGal,
    ).toBeNull()
  })

  it('reports no average efficiency when nothing is measurable', () => {
    expect(summariseFleet([]).avgNmPerGal).toBeNull()
    expect(
      summariseFleet([
        { hours_run: 2, distance_nm: null, fuel_used_gal: null, fuel_cost_usd: null },
      ]).avgNmPerGal,
    ).toBeNull()
  })
})
