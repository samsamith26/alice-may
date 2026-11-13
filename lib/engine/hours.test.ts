import { describe, expect, it } from 'vitest'
import { latestEngineHours } from './hours'

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
