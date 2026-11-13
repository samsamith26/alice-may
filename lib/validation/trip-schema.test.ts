import { describe, expect, it } from 'vitest'
import { newTripDefault } from '@/lib/trips/prefill'
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
    engine_hours_start: newTripDefault({
      isNewTrip: true,
      saved: undefined,
      draft: undefined,
      prefill: 278.3,
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

describe('tripSchema with a prefilled fuel gauge', () => {
  const blank = Object.fromEntries(Object.keys(tripSchema.shape).map((key) => [key, '']))
  const gauge = newTripDefault({ isNewTrip: true, saved: undefined, draft: undefined, prefill: 23.5 })

  it('saves the prefilled start gauge alongside an end reading', () => {
    const parsed = tripSchema.parse({
      ...blank,
      trip_date: '2026-11-13',
      fuel_from_full_start_gal: gauge,
      fuel_from_full_end_gal: '31.2',
    })
    expect(parsed.fuel_from_full_start_gal).toBe(23.5)
    expect(parsed.fuel_from_full_end_gal).toBe(31.2)
  })

  it('treats a cleared prefill as not recorded, never as zero', () => {
    const parsed = tripSchema.parse({
      ...blank,
      trip_date: '2026-11-13',
      fuel_from_full_start_gal: '',
    })
    expect(parsed.fuel_from_full_start_gal).toBeNull()
  })
})
