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
  await supabase.from('maintenance_log').delete().eq('id', entryId)
  revalidatePath('/maintenance')
  revalidatePath('/')
}

export async function saveScheduleIntervals(
  scheduleId: string,
  intervalHours: number | null,
  intervalMonths: number | null,
  active: boolean,
): Promise<void> {
  await requireCrew()
  const supabase = await createClient()
  await supabase
    .from('maintenance_schedule')
    .update({
      interval_hours: intervalHours,
      interval_months: intervalMonths,
      active,
    })
    .eq('id', scheduleId)
  revalidatePath('/maintenance')
  revalidatePath('/')
}
