import { createStore, del, entries, get, set } from 'idb-keyval'
import { stripControlCharacters } from '@/lib/validation/ids'

/**
 * A form's fields, each holding every value submitted under that name.
 *
 * Repeated fields — crew_ids, site_ids — used to be flattened into one
 * delimited string. The delimiter was a NUL, which nothing else in the app knew
 * about, so a second reader that split on a space instead got back a single id
 * with a NUL buried in it and passed it to the database, which rejected the
 * whole insert. An array cannot be misread that way.
 */
export type DraftValues = Record<string, string[]>

export type TripDraft = {
  id: string
  values: DraftValues
  /** Present only once the draft has been submitted while offline. */
  queuedAt?: number
  savedAt: number
  attempts: number
}

const MAX_ATTEMPTS = 5
const BASE_DELAY_MS = 30_000
const MAX_DELAY_MS = 15 * 60_000

/** Exponential backoff, capped so a stubborn draft still retries hourly-ish. */
export function nextAttemptDelayMs(attempts: number): number {
  if (attempts <= 0) return 0
  return Math.min(BASE_DELAY_MS * 2 ** (attempts - 1), MAX_DELAY_MS)
}

/**
 * Whether a queued draft should be retried now.
 *
 * A draft past its attempt limit is not syncable, but it is also never
 * discarded — it stays in the queue and stays visible, because a trip the
 * owner typed at the helm must not vanish because a server was unhappy.
 */
export function isSyncable(draft: TripDraft, now: number): boolean {
  if (draft.attempts >= MAX_ATTEMPTS) return false
  return now - draft.savedAt >= nextAttemptDelayMs(draft.attempts)
}

export function hasExhaustedRetries(draft: TripDraft): boolean {
  return draft.attempts >= MAX_ATTEMPTS
}

/**
 * Whether a draft has been overtaken by the copy on the server.
 *
 * A draft is a scratchpad kept in case the app dies mid-entry, and it only
 * deserves to win while it holds something the server has not got. Once the
 * trip has been saved since the draft was written, the draft is a photograph of
 * an older version — and letting it seed the form again put people back aboard
 * a trip they had been taken off, or left off people who had been added.
 *
 * A trip with no save behind it, and any unparseable timestamp, both leave the
 * draft standing: this decides which of two saved things is newer, and must
 * never be the reason unsent work disappears.
 */
export function isDraftStale(
  draft: TripDraft,
  serverSavedAt: string | null | undefined,
): boolean {
  if (!serverSavedAt) return false

  const savedOnServer = Date.parse(serverSavedAt)
  if (!Number.isFinite(savedOnServer)) return false

  return draft.savedAt <= savedOnServer
}

/* ------------------------------------------------------------- storage -- */

function store() {
  return createStore('alice-may', 'trip-drafts')
}

function formToValues(formData: FormData): DraftValues {
  const values: DraftValues = {}
  for (const [key, rawValue] of formData.entries()) {
    if (typeof rawValue !== 'string') continue
    // Cleaned on the way in, so a draft cannot hold a character the database
    // refuses and hand it back on every restore from here on.
    const value = stripControlCharacters(rawValue)
    values[key] = [...(values[key] ?? []), value]
  }
  return values
}

export function valuesToForm(values: DraftValues): FormData {
  const formData = new FormData()
  for (const [key, parts] of Object.entries(values)) {
    for (const part of parts) {
      formData.append(key, part)
    }
  }
  return formData
}

/** The delimiter drafts used before repeated fields became arrays. */
const LEGACY_SEPARATOR = '\u0000'

/**
 * Read a stored draft in whatever shape it was written. Drafts already sitting
 * on someone's phone predate the array form, and a trip typed at the helm is
 * not something to drop because the storage format moved on.
 */
export function normaliseValues(stored: unknown): DraftValues {
  const values: DraftValues = {}
  if (typeof stored !== 'object' || stored === null) return values

  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (Array.isArray(value)) {
      values[key] = value
        .filter((part): part is string => typeof part === 'string')
        .map(stripControlCharacters)
    } else if (typeof value === 'string') {
      values[key] = value.split(LEGACY_SEPARATOR).map(stripControlCharacters)
    }
  }
  return values
}

function normaliseDraft(draft: TripDraft | undefined): TripDraft | undefined {
  return draft ? { ...draft, values: normaliseValues(draft.values) } : undefined
}

const QUEUED_PREFIX = 'queued-'

/**
 * Autosave while typing. One buffer per form, overwritten freely — it is a
 * scratchpad, not a submission.
 */
export async function saveDraft(id: string, formData: FormData): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await set(
    id,
    {
      id,
      values: formToValues(formData),
      savedAt: Date.now(),
      attempts: 0,
    } satisfies TripDraft,
    store(),
  )
}

/**
 * Hand a draft to the upload queue — the offline submit path.
 *
 * Each submission gets its own key rather than reusing the form's buffer key.
 * Sharing one key meant logging a second trip before the first had uploaded
 * silently overwrote the first one's submitted data, and the autosave from the
 * second form then kept the first one's `queuedAt`, so the corrupted record
 * was still uploaded as though it were the original trip.
 *
 * Returns the queue key so the caller can clear the form's buffer.
 */
export async function queueDraft(
  bufferId: string,
  formData: FormData,
): Promise<string> {
  if (typeof indexedDB === 'undefined') return ''

  const id = `${QUEUED_PREFIX}${crypto.randomUUID()}`
  await set(
    id,
    {
      id,
      values: formToValues(formData),
      savedAt: Date.now(),
      queuedAt: Date.now(),
      attempts: 0,
    } satisfies TripDraft,
    store(),
  )

  // The scratchpad has been promoted; leaving it behind would prompt a bogus
  // "restored an unsent draft" on the next visit.
  await del(bufferId, store())
  return id
}

export async function loadDraft(id: string): Promise<TripDraft | undefined> {
  if (typeof indexedDB === 'undefined') return undefined
  return normaliseDraft(await get<TripDraft>(id, store()))
}

export async function listQueuedDrafts(): Promise<TripDraft[]> {
  if (typeof indexedDB === 'undefined') return []
  const all = await entries<string, TripDraft>(store())
  return all
    .map(([, draft]) => normaliseDraft(draft))
    .filter((draft): draft is TripDraft => draft?.queuedAt !== undefined)
    .sort((a, b) => (a.queuedAt ?? 0) - (b.queuedAt ?? 0))
}

export async function clearDraft(id: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await del(id, store())
}

export async function recordFailedAttempt(draft: TripDraft): Promise<void> {
  if (typeof indexedDB === 'undefined') return
  await set(
    draft.id,
    { ...draft, attempts: draft.attempts + 1, savedAt: Date.now() },
    store(),
  )
}
