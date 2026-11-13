import type { EmailOtpType } from '@supabase/supabase-js'

/**
 * Parsing for what arrives on /auth/confirm. Everything here comes from a
 * query string anyone can type, so nothing is cast; it is checked.
 */

/**
 * The types an emailed link can carry. `signup` and `magiclink` are older
 * spellings of `email` that Supabase still accepts, kept so a template
 * written either way works.
 */
const EMAIL_OTP_TYPES = [
  'email',
  'signup',
  'recovery',
  'magiclink',
  'invite',
  'email_change',
] as const satisfies readonly EmailOtpType[]

export function asOtpType(value: unknown): EmailOtpType | null {
  return typeof value === 'string' &&
    (EMAIL_OTP_TYPES as readonly string[]).includes(value)
    ? (value as EmailOtpType)
    : null
}

/**
 * Only ever send someone on to a path inside this app. A leading `//` or `/\`
 * is read by browsers as another host, so neither counts as a path.
 */
export function safeNext(value: unknown, fallback = '/'): string {
  if (typeof value !== 'string') return fallback
  if (!value.startsWith('/')) return fallback
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback
  return value
}

export type LinkPurpose = 'signup' | 'recovery' | 'other'

/** What the link is for, which decides the copy and where a failure goes. */
export function linkPurpose(type: EmailOtpType | null): LinkPurpose {
  if (type === 'recovery') return 'recovery'
  if (type === 'signup' || type === 'email') return 'signup'
  return 'other'
}

/**
 * Where a link that turned out to be dead sends you. A dead reset link goes
 * back to the reset form, because asking for another is the only fix.
 */
export function linkFailurePath(purpose: LinkPurpose, reason: 'expired' | 'missing'): string {
  const error = reason === 'expired' ? 'link_expired' : 'missing_token'
  return purpose === 'recovery'
    ? `/forgot-password?error=${error}`
    : `/login?error=${error}`
}

export const UPDATE_PASSWORD_PATH = '/auth/update-password'

/**
 * True when a session was started by a password-reset link. Supabase records
 * how a session began in the JWT's `amr` claim; a reset shows up as method
 * "recovery". Needed because a reset that arrives as `?code=` (Supabase's
 * default template) carries no `type` to say what it was.
 */
export function isRecoverySession(amr: unknown): boolean {
  if (!Array.isArray(amr)) return false
  return amr.some(
    (entry) =>
      entry === 'recovery' ||
      (typeof entry === 'object' &&
        entry !== null &&
        (entry as { method?: unknown }).method === 'recovery'),
  )
}

/**
 * Where to go once a link has been spent. A reset always ends on the
 * set-password form, whatever `next` said: being signed in without ever
 * being asked for the new password would leave the person no better off.
 */
export function destinationAfterLink(next: string, recovery: boolean): string {
  return recovery ? UPDATE_PASSWORD_PATH : safeNext(next)
}

/**
 * Text the before-user-created hook puts in its rejection. The signup action
 * matches on it to turn the hook's refusal into friendly copy, so the two
 * must stay in step with supabase/schema.sql.
 */
export const NOT_APPROVED_MARKER = 'not approved for this logbook'

export function isNotApprovedError(error: { message?: string; status?: number } | null): boolean {
  if (!error) return false
  return (error.message ?? '').toLowerCase().includes(NOT_APPROVED_MARKER)
}
