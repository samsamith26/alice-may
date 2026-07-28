import { describe, expect, it } from 'vitest'
import {
  hasExhaustedRetries,
  isDraftStale,
  isSyncable,
  nextAttemptDelayMs,
  normaliseValues,
  valuesToForm,
  type TripDraft,
} from './drafts'

function draft(overrides: Partial<TripDraft> = {}): TripDraft {
  return { id: 'a', values: {}, savedAt: 0, attempts: 0, ...overrides }
}

describe('draft sync policy', () => {
  it('syncs a fresh draft immediately', () => {
    expect(isSyncable(draft(), 1000)).toBe(true)
  })

  it('backs off after a failed attempt', () => {
    expect(isSyncable(draft({ attempts: 1 }), 1000)).toBe(false)
  })

  it('retries once the backoff window has passed', () => {
    expect(isSyncable(draft({ attempts: 1 }), 60_000)).toBe(true)
  })

  it('backs off exponentially', () => {
    expect(nextAttemptDelayMs(1)).toBeLessThan(nextAttemptDelayMs(2))
    expect(nextAttemptDelayMs(2)).toBeLessThan(nextAttemptDelayMs(3))
  })

  it('caps the backoff so a stubborn draft keeps retrying', () => {
    expect(nextAttemptDelayMs(50)).toBe(15 * 60_000)
  })

  it('stops retrying after five attempts', () => {
    expect(isSyncable(draft({ attempts: 5 }), 10_000_000)).toBe(false)
  })

  it('marks an exhausted draft rather than treating it as gone', () => {
    // The draft is kept so the trip stays recoverable; it just stops retrying.
    expect(hasExhaustedRetries(draft({ attempts: 5 }))).toBe(true)
    expect(hasExhaustedRetries(draft({ attempts: 4 }))).toBe(false)
  })
})

describe('valuesToForm', () => {
  it('restores repeated fields as separate entries', () => {
    const form = valuesToForm({
      crew_ids: ['a', 'b'],
      trip_date: ['2026-07-01'],
    })
    expect(form.getAll('crew_ids')).toEqual(['a', 'b'])
    expect(form.get('trip_date')).toBe('2026-07-01')
  })
})

describe('normaliseValues', () => {
  const first = '11111111-1111-4111-8111-111111111111'
  const second = '22222222-2222-4222-8222-222222222222'

  it('reads a draft already stored as lists', () => {
    expect(normaliseValues({ crew_ids: [first, second] })).toEqual({
      crew_ids: [first, second],
    })
  })

  it('splits a draft written before fields became lists', () => {
    // The old format joined repeated values with a NUL. Read back whole it was
    // one id with a NUL buried in it, which the database rejected outright -
    // taking everyone else on the trip down with it.
    expect(normaliseValues({ crew_ids: `${first}\u0000${second}` })).toEqual({
      crew_ids: [first, second],
    })
  })

  it('strips control characters left behind in an old draft', () => {
    expect(normaliseValues({ notes: 'ok\u0007bell' })).toEqual({
      notes: ['okbell'],
    })
  })

  it('keeps the newlines that notes are written in', () => {
    expect(normaliseValues({ notes: ['two\nlines'] })).toEqual({
      notes: ['two\nlines'],
    })
  })

  it('ignores anything that is not a draft', () => {
    expect(normaliseValues(null)).toEqual({})
    expect(normaliseValues({ crew_ids: 7 })).toEqual({})
  })
})

/**
 * The reported failure: add several people to a trip, save, reopen the edit
 * page, and some of them were no longer ticked. The trip itself was correct
 * throughout — the form was seeding the picker from the draft it had autosaved
 * a moment before saving, which is a snapshot of an older selection. Saving
 * again then wrote that older selection back over the good one.
 */
describe('isDraftStale', () => {
  const SAVED_AT = '2026-07-28T02:30:00.000Z'
  const savedMs = Date.parse(SAVED_AT)

  const stale = (savedAt: number): TripDraft => ({
    id: 'trip-6150ded2',
    values: { crew_ids: ['11111111-1111-4111-8111-111111111111'] },
    savedAt,
    attempts: 0,
  })

  it('discards a draft written before the trip was saved', () => {
    // Autosaved while typing, then the save landed a second later.
    expect(isDraftStale(stale(savedMs - 1_000), SAVED_AT)).toBe(true)
  })

  it('discards a draft written at the very moment of the save', () => {
    expect(isDraftStale(stale(savedMs), SAVED_AT)).toBe(true)
  })

  it('keeps a draft written since the last save', () => {
    // Genuinely unsent work — editing again after saving, or offline.
    expect(isDraftStale(stale(savedMs + 1_000), SAVED_AT)).toBe(false)
  })

  it('keeps a draft when the trip has never been saved', () => {
    expect(isDraftStale(stale(savedMs), null)).toBe(false)
    expect(isDraftStale(stale(savedMs), undefined)).toBe(false)
  })

  it('keeps a draft rather than trusting a timestamp it cannot read', () => {
    // Never the reason unsent work disappears.
    expect(isDraftStale(stale(savedMs), 'not a date')).toBe(false)
  })

  describe('reopening the edit page after adding passengers', () => {
    const BECCA = 'b307863b-3ace-450c-adef-e314bc0c7e69'
    const CHRIS = 'f71156b8-2046-4425-ad89-ea85cb6d11cd'
    const LILLY = '056e11d2-9c47-47b9-8a10-0ea0e821f00f'

    /** What the picker seeds itself from, given a draft and what was saved. */
    function ticked(
      stored: TripDraft | undefined,
      serverSavedAt: string | null,
      savedCrewIds: string[],
    ): string[] {
      if (stored && !isDraftStale(stored, serverSavedAt)) {
        return stored.values.crew_ids ?? []
      }
      return savedCrewIds
    }

    it('shows everyone saved, not the half-finished autosave', () => {
      // Autosaved after ticking Becca, before Chris and Lilly were added.
      const partway = stale(savedMs - 4_000)
      partway.values = { crew_ids: [BECCA] }

      expect(ticked(partway, SAVED_AT, [BECCA, CHRIS, LILLY])).toEqual([
        BECCA,
        CHRIS,
        LILLY,
      ])
    })

    it('still shows everyone saved when there is no draft at all', () => {
      expect(ticked(undefined, SAVED_AT, [BECCA, CHRIS, LILLY])).toEqual([
        BECCA,
        CHRIS,
        LILLY,
      ])
    })

    it('does not resurrect somebody taken off the trip', () => {
      const withChris = stale(savedMs - 4_000)
      withChris.values = { crew_ids: [BECCA, CHRIS] }

      expect(ticked(withChris, SAVED_AT, [BECCA])).toEqual([BECCA])
    })

    it('keeps unsent changes made after the save', () => {
      const sinceSaving = stale(savedMs + 5_000)
      sinceSaving.values = { crew_ids: [BECCA, CHRIS, LILLY] }

      expect(ticked(sinceSaving, SAVED_AT, [BECCA])).toEqual([
        BECCA,
        CHRIS,
        LILLY,
      ])
    })
  })
})
