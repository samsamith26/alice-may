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

export async function saveScheduleIntervals(
  scheduleId: string,
  intervalHours: number | null,
  intervalMonths: number | null,
  active: boolean,
): Promise<{ ok: boolean; message?: string }> {
  await requireCrew()

  // The table's check constraint requires at least one interval; catching it
  // here gives a sentence rather than a raw Postgres error.
  if (intervalHours === null && intervalMonths === null) {
    return { ok: false, message: 'Set an hour interval, a month interval, or both.' }
  }
  if (
    (intervalHours !== null && intervalHours <= 0) ||
    (intervalMonths !== null && intervalMonths <= 0)
  ) {
    return { ok: false, message: 'Intervals must be greater than zero.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('maintenance_schedule')
    .update({
      interval_hours: intervalHours,
      interval_months: intervalMonths,
      active,
    })
    .eq('id', scheduleId)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/maintenance')
  revalidatePath('/')
  return { ok: true }
}
