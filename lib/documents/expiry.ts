/** Document expiry status. Pure — no database access. */

export type DocumentStatus = 'ok' | 'expiring' | 'expired'

/** Long enough to renew a registration without rushing it. */
const WARNING_DAYS = 60

export function documentStatus(
  expiresOn: string | null | undefined,
  today: Date,
): DocumentStatus {
  if (!expiresOn) return 'ok'

  const expiry = Date.parse(`${expiresOn}T12:00:00Z`)
  if (Number.isNaN(expiry)) return 'ok'

  const todayMidday = Date.parse(`${today.toISOString().slice(0, 10)}T12:00:00Z`)
  const daysRemaining = Math.round((expiry - todayMidday) / 86_400_000)

  if (daysRemaining < 0) return 'expired'
  if (daysRemaining <= WARNING_DAYS) return 'expiring'
  return 'ok'
}

export function daysUntilExpiry(
  expiresOn: string | null | undefined,
  today: Date,
): number | null {
  if (!expiresOn) return null
  const expiry = Date.parse(`${expiresOn}T12:00:00Z`)
  if (Number.isNaN(expiry)) return null
  const todayMidday = Date.parse(`${today.toISOString().slice(0, 10)}T12:00:00Z`)
  return Math.round((expiry - todayMidday) / 86_400_000)
}
