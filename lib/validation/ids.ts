/**
 * Identifier and text hygiene for values that come back off the wire or out of
 * a browser store, rather than straight from the database.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value.trim())
}

/**
 * The ids in a list of picked values: real ids, each appearing once, in the
 * order they were picked.
 *
 * Both halves matter for a join table keyed on (trip, person). Anything not an
 * id fails the insert outright, and the same id twice collides with itself —
 * either way the whole batch is rejected and the trip ends up with nobody
 * aboard. Compared case-insensitively, since two spellings of one id are still
 * one person.
 */
export function uniqueUuids(values: string[]): string[] {
  const seen = new Set<string>()
  const ids: string[] = []

  for (const value of values) {
    const id = value.trim()
    if (!isUuid(id)) continue

    const key = id.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    ids.push(id)
  }
  return ids
}

/**
 * Strip control characters that no field in this app has any use for.
 *
 * Tab, newline and carriage return are kept — trip notes are written in
 * paragraphs. Everything else in that range is removed, NUL above all: Postgres
 * cannot store it, and a single one anywhere in a request body makes the whole
 * thing invalid JSON to the server, which then rejects every row in the batch
 * rather than the one bad value.
 */
export function stripControlCharacters(value: string): string {
  return value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
}
