import { describe, expect, it } from 'vitest'
import { isUuid, stripControlCharacters, uniqueUuids } from './ids'

const BECCA = 'b307863b-3ace-450c-adef-e314bc0c7e69'
const CHRIS = 'f71156b8-2046-4425-ad89-ea85cb6d11cd'
const LILLY = '056e11d2-9c47-47b9-8a10-0ea0e821f00f'

describe('isUuid', () => {
  it('accepts an id in either case, with surrounding space', () => {
    expect(isUuid(BECCA)).toBe(true)
    expect(isUuid(BECCA.toUpperCase())).toBe(true)
    expect(isUuid(`  ${BECCA}  `)).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isUuid('')).toBe(false)
    expect(isUuid('Becca Eberle')).toBe(false)
    expect(isUuid(BECCA.slice(0, -1))).toBe(false)
    // Two ids run together, which is how a mis-split draft used to arrive.
    expect(isUuid(`${BECCA}${CHRIS}`)).toBe(false)
  })
})

/**
 * The list of people a trip form submits. Everything here is a case that
 * previously took the whole insert down with it, leaving a trip that had
 * people aboard saved with none.
 */
describe('uniqueUuids', () => {
  it('keeps a straightforward selection in the order it was picked', () => {
    expect(uniqueUuids([CHRIS, BECCA, LILLY])).toEqual([CHRIS, BECCA, LILLY])
  })

  it('collapses the same person listed twice', () => {
    // A join table keyed on (trip, person) rejects the batch outright.
    expect(uniqueUuids([CHRIS, BECCA, CHRIS])).toEqual([CHRIS, BECCA])
  })

  it('treats two spellings of one id as one person', () => {
    expect(uniqueUuids([CHRIS, CHRIS.toUpperCase()])).toEqual([CHRIS])
  })

  it('keeps the first occurrence, not the last', () => {
    expect(uniqueUuids([CHRIS, BECCA, CHRIS, LILLY])).toEqual([
      CHRIS,
      BECCA,
      LILLY,
    ])
  })

  it('drops values that are not ids without dropping the rest', () => {
    expect(uniqueUuids(['', 'Becca', `${BECCA}\u0000`, CHRIS])).toEqual([CHRIS])
  })

  it('trims before judging', () => {
    expect(uniqueUuids([` ${CHRIS} `, CHRIS])).toEqual([CHRIS])
  })

  it('has nothing to say about an empty selection', () => {
    expect(uniqueUuids([])).toEqual([])
  })

  /**
   * The reported failure: open a trip that already has people aboard, save it
   * again unchanged, and the insert collided with itself. Re-saving has to be
   * idempotent, and an overlapping list has to be a plain replacement.
   */
  describe('re-saving a trip that already has passengers', () => {
    const alreadySaved = [BECCA, CHRIS]

    it('is idempotent when the list has not changed', () => {
      expect(uniqueUuids(alreadySaved)).toEqual(alreadySaved)
      expect(uniqueUuids(uniqueUuids(alreadySaved))).toEqual(alreadySaved)
    })

    it('replaces rather than merges when the list overlaps', () => {
      // Chris stays, Becca comes off, Lilly joins.
      expect(uniqueUuids([CHRIS, LILLY])).toEqual([CHRIS, LILLY])
    })

    it('survives someone already aboard being picked again', () => {
      expect(uniqueUuids([...alreadySaved, CHRIS])).toEqual(alreadySaved)
    })

    it('clears the list when everyone is unticked', () => {
      expect(uniqueUuids([])).toEqual([])
    })
  })
})

describe('stripControlCharacters', () => {
  it('removes a NUL, which Postgres cannot store at all', () => {
    expect(stripControlCharacters(`${BECCA}\u0000`)).toBe(BECCA)
  })

  it('keeps the newlines and tabs that notes are written in', () => {
    expect(stripControlCharacters('two\nlines\tover')).toBe('two\nlines\tover')
  })

  it('leaves ordinary text alone', () => {
    expect(stripControlCharacters('Monterey Bay Boat Works')).toBe(
      'Monterey Bay Boat Works',
    )
  })
})
