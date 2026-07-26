import { describe, expect, it } from 'vitest'
import { daysUntilExpiry, documentStatus } from './expiry'

const today = new Date('2026-07-26T00:00:00Z')

describe('documentStatus', () => {
  it('is ok when far from expiry', () => {
    expect(documentStatus('2027-01-01', today)).toBe('ok')
  })

  it('warns within 60 days', () => {
    expect(documentStatus('2026-08-15', today)).toBe('expiring')
  })

  it('still warns on the expiry date itself', () => {
    expect(documentStatus('2026-07-26', today)).toBe('expiring')
  })

  it('is expired the day after the expiry date', () => {
    expect(documentStatus('2026-07-25', today)).toBe('expired')
  })

  it('treats a missing expiry date as ok', () => {
    expect(documentStatus(null, today)).toBe('ok')
    expect(documentStatus(undefined, today)).toBe('ok')
  })

  it('does not crash on a malformed date', () => {
    expect(documentStatus('not-a-date', today)).toBe('ok')
  })
})

describe('daysUntilExpiry', () => {
  it('counts forward and backward', () => {
    expect(daysUntilExpiry('2026-07-31', today)).toBe(5)
    expect(daysUntilExpiry('2026-07-21', today)).toBe(-5)
  })

  it('has nothing to count without a date', () => {
    expect(daysUntilExpiry(null, today)).toBeNull()
  })
})
