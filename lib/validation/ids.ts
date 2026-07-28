/**
 * Identifier and text hygiene for values that come back off the wire or out of
 * a browser store, rather than straight from the database.
 */

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID.test(value.trim())
}

export function uuidsOnly(values: string[]): string[] {
  return values.map((value) => value.trim()).filter(isUuid)
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
