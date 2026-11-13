/** Starting values for the trip form. Pure — no imports, no I/O. */

/**
 * What a prefilled field on the trip form opens with — "Hours at start" from
 * the engine's latest reading, "Gallons used at start" from the last trip's
 * gauge. Only a starting value: the field stays an ordinary input, and what
 * is in it on submit is what gets saved.
 *
 * An existing trip behaves exactly as the rest of the form does: a restored
 * draft's value (even an emptied field) over the saved one, and never the
 * prefill, which would rewrite history. A new trip takes a draft's value when
 * it has one, and otherwise starts from the prefill.
 */
export function newTripDefault({
  isNewTrip,
  saved,
  draft,
  prefill,
}: {
  isNewTrip: boolean
  saved: string | null | undefined
  draft: string | null | undefined
  prefill: number | null
}): string {
  if (!isNewTrip) return draft ?? saved ?? ''
  if (draft !== null && draft !== undefined && draft.trim() !== '') return draft
  return prefill === null ? '' : String(prefill)
}
