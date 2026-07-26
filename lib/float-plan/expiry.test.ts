import { describe, expect, it } from 'vitest'
import { expiryFor, floatPlanState } from './expiry'

const base = {
  departure_at: '2026-07-26T08:00:00Z',
  planned_return_at: '2026-07-26T16:00:00Z',
  expires_at: '2026-07-27T16:00:00Z',
  closed_at: null as string | null,
}

describe('floatPlanState', () => {
  it('is active before the planned return', () => {
    expect(floatPlanState(base, new Date('2026-07-26T12:00:00Z'))).toBe('active')
  })

  it('is overdue after the planned return with no check-in', () => {
    expect(floatPlanState(base, new Date('2026-07-26T17:00:00Z'))).toBe('overdue')
  })

  it('is closed once checked in, even past the return time', () => {
    // A skipper who got back safe must never later read as overdue.
    expect(
      floatPlanState(
        { ...base, closed_at: '2026-07-26T15:30:00Z' },
        new Date('2026-07-26T17:00:00Z'),
      ),
    ).toBe('closed')
  })

  it('stays closed even past the expiry timestamp', () => {
    expect(
      floatPlanState(
        { ...base, closed_at: '2026-07-26T15:30:00Z' },
        new Date('2026-07-30T00:00:00Z'),
      ),
    ).toBe('closed')
  })

  it('is expired past the expiry timestamp', () => {
    expect(floatPlanState(base, new Date('2026-07-28T00:00:00Z'))).toBe('expired')
  })
})

describe('expiryFor', () => {
  it('sits 24 hours past the planned return', () => {
    expect(expiryFor('2026-07-26T16:00:00Z')).toBe('2026-07-27T16:00:00.000Z')
  })
})
