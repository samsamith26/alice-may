import { describe, expect, it } from 'vitest'
import { newTripDefault } from './prefill'

describe('newTripDefault', () => {
  it('prefills a new trip', () => {
    expect(
      newTripDefault({ isNewTrip: true, saved: undefined, draft: undefined, prefill: 1234.5 }),
    ).toBe('1234.5')
  })

  it('leaves a new trip blank when there is nothing to prefill', () => {
    expect(
      newTripDefault({ isNewTrip: true, saved: undefined, draft: undefined, prefill: null }),
    ).toBe('')
  })

  it('never overwrites an existing trip, even a blank one', () => {
    expect(
      newTripDefault({ isNewTrip: false, saved: '1100', draft: undefined, prefill: 1234.5 }),
    ).toBe('1100')
    expect(
      newTripDefault({ isNewTrip: false, saved: undefined, draft: undefined, prefill: 1234.5 }),
    ).toBe('')
  })

  it('lets a restored draft win over the prefill', () => {
    expect(
      newTripDefault({ isNewTrip: true, saved: undefined, draft: '1229', prefill: 1234.5 }),
    ).toBe('1229')
  })

  it('lets a restored draft win over the saved value when editing', () => {
    expect(
      newTripDefault({ isNewTrip: false, saved: '1100', draft: '1101', prefill: 1234.5 }),
    ).toBe('1101')
  })

  it('keeps an edit draft that emptied the field, as the rest of the form does', () => {
    expect(
      newTripDefault({ isNewTrip: false, saved: '1100', draft: '', prefill: 1234.5 }),
    ).toBe('')
  })

  it('falls back to the prefill when a new-trip draft left the field empty', () => {
    expect(
      newTripDefault({ isNewTrip: true, saved: undefined, draft: '  ', prefill: 1234.5 }),
    ).toBe('1234.5')
  })
})
