/** Float plan lifecycle. Pure — no database access. */

export type FloatPlanState = 'active' | 'overdue' | 'closed' | 'expired'

export type FloatPlanTimes = {
  departure_at: string
  planned_return_at: string
  expires_at: string
  closed_at: string | null
}

/**
 * Precedence matters: `closed` is checked before `expired`, so a plan the
 * skipper checked in on never later reads as a problem to whoever opens the
 * link.
 */
export function floatPlanState(plan: FloatPlanTimes, now: Date): FloatPlanState {
  if (plan.closed_at) return 'closed'

  const nowMs = now.getTime()
  if (nowMs > Date.parse(plan.expires_at)) return 'expired'
  if (nowMs > Date.parse(plan.planned_return_at)) return 'overdue'
  return 'active'
}

/** Auto-expiry sits a day past the planned return. */
export const EXPIRY_GRACE_MS = 24 * 60 * 60 * 1000

export function expiryFor(plannedReturnAt: string): string {
  return new Date(Date.parse(plannedReturnAt) + EXPIRY_GRACE_MS).toISOString()
}
