import { describe, expect, it } from 'vitest'
import { startHoursDefault } from '@/lib/engine/hours'
import { tripSchema } from './schemas'

/** A new trip as the form submits it, with "Hours at start" prefilled. */
function submission(end: string) {
  // The form posts every field, blank ones as ''.
  const blank = Object.fromEntries(
    Object.keys(tripSchema.shape).map((key) => [key, '']),
  )
  return {
    ...blank,
    trip_date: '2026-11-13',
    engine_hours_start: startHoursDefault({
      isNewTrip: true,
      saved: undefined,
      draft: undefined,
      current: 278.3,
    }),
    engine_hours_end: end,
  }
}

describe('tripSchema with a prefilled start reading', () => {
  it('accepts the prefill with end left blank', () => {
    const parsed = tripSchema.parse(submission(''))
    expect(parsed.engine_hours_start).toBe(278.3)
    expect(parsed.engine_hours_end).toBeNull()
  })

  it('accepts an end reading at or above the prefill', () => {
    expect(tripSchema.parse(submission('281.6')).engine_hours_end).toBe(281.6)
    expect(tripSchema.safeParse(submission('278.3')).success).toBe(true)
  })

  it('still rejects an end reading below the prefilled start', () => {
    const result = tripSchema.safeParse(submission('270'))
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.path).toEqual(['engine_hours_end'])
    }
  })
})
