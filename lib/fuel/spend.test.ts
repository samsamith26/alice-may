import { describe, expect, it } from 'vitest'
import { spendEntries, spendYears, totalsByType, FUEL_TYPE } from './spend'

const trips = [
  { trip_date: '2025-06-01', fuel_cost_usd: 120 },
  { trip_date: '2025-08-14', fuel_cost_usd: 80 },
  { trip_date: '2026-07-14', fuel_cost_usd: 45 },
  // No price per gallon was recorded, so there is no cost to count.
  { trip_date: '2026-07-20', fuel_cost_usd: null },
]

const services = [
  { service_date: '2025-01-02', service_type: 'Rent', cost: 3600 },
  { service_date: '2025-11-05', service_type: 'House battery', cost: 400 },
  { service_date: '2026-01-01', service_type: 'Rent', cost: 3709 },
  { service_date: '2026-03-02', service_type: 'Anodes / zincs', cost: 1762.92 },
  // Logged but never priced.
  { service_date: '2026-04-01', service_type: 'Fuel filter', cost: null },
]

describe('spendEntries', () => {
  it('puts fuel and service costs on the same footing', () => {
    const entries = spendEntries(trips, services)
    expect(entries).toContainEqual({
      year: '2025',
      type: FUEL_TYPE,
      amount: 120,
    })
    expect(entries).toContainEqual({ year: '2025', type: 'Rent', amount: 3600 })
  })

  it('drops what was never priced rather than counting it as free', () => {
    // Three trips and four services carry a cost; the other two carry none.
    const entries = spendEntries(trips, services)
    expect(entries).toHaveLength(7)
    expect(entries.some((entry) => entry.type === 'Fuel filter')).toBe(false)
  })

  it('takes the year from the date it happened', () => {
    const entries = spendEntries(trips, services)
    expect(entries.filter((entry) => entry.year === '2026')).toHaveLength(3)
  })

  it('has nothing to say about an empty logbook', () => {
    expect(spendEntries([], [])).toEqual([])
  })
})

describe('spendYears', () => {
  it('lists the years with spending in them, oldest first', () => {
    expect(spendYears(spendEntries(trips, services))).toEqual(['2025', '2026'])
  })

  it('does not invent a year from an entry with no cost', () => {
    const entries = spendEntries(
      [{ trip_date: '2024-05-01', fuel_cost_usd: null }],
      [],
    )
    expect(spendYears(entries)).toEqual([])
  })
})

describe('totalsByType', () => {
  const entries = spendEntries(trips, services)

  it('adds up everything when no year is chosen', () => {
    expect(totalsByType(entries, null)).toEqual([
      { label: 'Rent', value: 7309 },
      { label: 'Anodes / zincs', value: 1762.92 },
      { label: 'House battery', value: 400 },
      { label: FUEL_TYPE, value: 245 },
    ])
  })

  it('counts only the year asked for', () => {
    expect(totalsByType(entries, '2025')).toEqual([
      { label: 'Rent', value: 3600 },
      { label: 'House battery', value: 400 },
      { label: FUEL_TYPE, value: 200 },
    ])
  })

  it('puts the biggest first, since the question is where the money goes', () => {
    const rows = totalsByType(entries, '2026')
    expect(rows.map((row) => row.label)).toEqual([
      'Rent',
      'Anodes / zincs',
      FUEL_TYPE,
    ])
  })

  it('breaks ties by name so the order does not wander between renders', () => {
    const tied = [
      { year: '2026', type: 'Thruster battery', amount: 300 },
      { year: '2026', type: 'House battery', amount: 300 },
    ]
    expect(totalsByType(tied, null).map((row) => row.label)).toEqual([
      'House battery',
      'Thruster battery',
    ])
  })

  it('sums several trips into one fuel figure', () => {
    expect(totalsByType(entries, '2025')).toContainEqual({
      label: FUEL_TYPE,
      value: 200,
    })
  })

  it('rounds away the floating-point dust that adding money leaves', () => {
    const pennies = [
      { year: '2026', type: 'Rent', amount: 0.1 },
      { year: '2026', type: 'Rent', amount: 0.2 },
    ]
    expect(totalsByType(pennies, null)).toEqual([{ label: 'Rent', value: 0.3 }])
  })

  it('returns nothing for a year with no spending', () => {
    expect(totalsByType(entries, '2024')).toEqual([])
  })
})
