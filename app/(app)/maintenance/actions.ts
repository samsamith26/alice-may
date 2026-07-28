'use server'

import { revalidatePath } from 'next/cache'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { maintenanceLogSchema } from '@/lib/validation/schemas'

export type ServiceState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string }

export async function logService(
  _prev: ServiceState,
  formData: FormData,
): Promise<ServiceState> {
  const membership = await requireCrew()

  const parsed = maintenanceLogSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return { status: 'error', message: parsed.error.issues[0]?.message ?? 'Check the form.' }
  }

  const supabase = await createClient()
  const { id, ...values } = parsed.data

  const { error } = id
    ? await supabase.from('maintenance_log').update(values).eq('id', id)
    : await supabase.from('maintenance_log').insert({
        ...values,
        boat_id: membership.boatId,
        created_by: membership.userId,
      })

  if (error) return { status: 'error', message: error.message }

  revalidatePath('/maintenance')
  revalidatePath('/')
  return { status: 'saved' }
}

export async function deleteServiceEntry(entryId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()

  const { error } = await supabase.from('maintenance_log').delete().eq('id', entryId)
  // Silently returning would make the row reappear on refresh with no
  // explanation of why the delete "didn't take".
  if (error) throw new Error(`Could not delete the entry: ${error.message}`)

  revalidatePath('/maintenance')
  revalidatePath('/')
}

const INTERVAL_UNITS = ['day', 'week', 'month', 'year'] as const
type IntervalUnit = (typeof INTERVAL_UNITS)[number]

/**
 * Change how often a schedule item comes round.
 *
 * The only way scheduling moves. Due points are always last done plus these
 * intervals, so there is nothing else to write.
 */
export async function saveScheduleIntervals(
  scheduleId: string,
  intervalHours: number | null,
  intervalCount: number | null,
  intervalUnit: IntervalUnit | null,
  active: boolean,
): Promise<{ ok: boolean; message?: string }> {
  await requireCrew()

  if (intervalHours !== null && (!Number.isFinite(intervalHours) || intervalHours <= 0)) {
    return { ok: false, message: 'The hour interval must be greater than zero.' }
  }
  if (
    intervalCount !== null &&
    (!Number.isInteger(intervalCount) || intervalCount <= 0)
  ) {
    return { ok: false, message: 'The time interval must be a whole number above zero.' }
  }
  if (intervalCount !== null && intervalUnit === null) {
    return { ok: false, message: 'Pick days, weeks, months or years.' }
  }
  if (intervalUnit !== null && !INTERVAL_UNITS.includes(intervalUnit)) {
    return { ok: false, message: 'Pick days, weeks, months or years.' }
  }

  // The table's check constraint requires a rule of some kind; catching it here
  // gives a sentence rather than a raw Postgres error.
  if (intervalHours === null && intervalCount === null) {
    return { ok: false, message: 'Set an hour interval, a time interval, or both.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('maintenance_schedule')
    .update({
      interval_hours: intervalHours,
      interval_count: intervalCount,
      // The pair has to move together or the constraint rejects it.
      interval_unit: intervalCount === null ? null : intervalUnit,
      active,
    })
    .eq('id', scheduleId)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/maintenance')
  revalidatePath('/')
  return { ok: true }
}
