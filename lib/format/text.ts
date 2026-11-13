/** Text trimming for previews. Pure — no imports, no I/O. */

/**
 * The start of a passage, at most `max` characters, cut at a word boundary
 * and marked with an ellipsis when anything was dropped. Whitespace runs
 * (including line breaks) collapse to single spaces. Blank in, null out.
 */
export function excerpt(text: string | null | undefined, max: number): string | null {
  if (text === null || text === undefined) return null
  const flat = text.replace(/\s+/g, ' ').trim()
  if (flat === '') return null
  if (flat.length <= max) return flat

  const cut = flat.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  // Already at a word boundary when the next character is a space. Otherwise
  // back up to the last space, but only if that keeps most of the budget; a
  // single long word is cut where it stands.
  const atBoundary = flat[max] === ' '
  const clean = atBoundary || lastSpace <= max * 0.6 ? cut : cut.slice(0, lastSpace)
  return `${clean.replace(/[\s.,;:!?-]+$/, '')}…`
}
