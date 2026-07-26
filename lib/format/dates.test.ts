import { describe, expect, it } from 'vitest'
import { addDaysIso, todayInZone } from './dates'

describe('todayInZone', () => {
  it('gives the Pacific date, not the UTC one, late in the evening', () => {
    // 2026-07-27T02:00Z is still 7pm on the 26th in Monterey. Using the UTC
    // date here would label the 27th as "Today" on the tide page every evening.
    const instant = new Date('2026-07-27T02:00:00Z')
    expect(instant.toISOString().slice(0, 10)).toBe('2026-07-27')
    expect(todayInZone(instant)).toBe('2026-07-26')
  })

  it('agrees with UTC during the Pacific afternoon', () => {
    expect(todayInZone(new Date('2026-07-26T20:00:00Z'))).toBe('2026-07-26')
  })

  it('handles the turn of the year', () => {
    expect(todayInZone(new Date('2027-01-01T05:00:00Z'))).toBe('2026-12-31')
  })
})

describe('addDaysIso', () => {
  it('adds days', () => {
    expect(addDaysIso('2026-07-26', 6)).toBe('2026-08-01')
  })

  it('crosses a DST boundary without slipping a day', () => {
    // US DST ends 2026-11-01.
    expect(addDaysIso('2026-10-31', 2)).toBe('2026-11-02')
  })

  it('goes backwards too', () => {
    expect(addDaysIso('2026-01-01', -1)).toBe('2025-12-31')
  })
})
