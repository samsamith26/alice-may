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

/**
 * Override the computed due point for one schedule item.
 *
 * Passing null for both clears the override. The anchor — the service date the
 * override is granted against — is read from the log here rather than taken
 * from the caller, so it always matches what computeDueStatus will compare it
 * to when it decides whether the override is still live.
 */
export async function saveDueOverride(
  scheduleId: string,
  dueAtHours: number | null,
  dueOnDate: string | null,
): Promise<{ ok: boolean; message?: string }> {
  await requireCrew()

  if (dueAtHours !== null && (!Number.isFinite(dueAtHours) || dueAtHours < 0)) {
    return { ok: false, message: 'Due at hours must be a number of hours.' }
  }
  if (dueOnDate !== null && !/^\d{4}-\d{2}-\d{2}$/.test(dueOnDate)) {
    return { ok: false, message: 'Pick a valid due date.' }
  }

  const supabase = await createClient()

  const clearing = dueAtHours === null && dueOnDate === null
  let anchor: string | null = null

  if (!clearing) {
    // RLS scopes this to the caller's boat, so the service type is enough.
    const { data: schedule } = await supabase
      .from('maintenance_schedule')
      .select('service_type')
      .eq('id', scheduleId)
      .maybeSingle()

    if (!schedule) return { ok: false, message: 'That schedule item is gone.' }

    const { data: latest } = await supabase
      .from('maintenance_log')
      .select('service_date')
      .eq('service_type', schedule.service_type)
      .order('service_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    anchor = latest?.service_date ?? null
  }

  const { error } = await supabase
    .from('maintenance_schedule')
    .update({
      due_at_hours_override: dueAtHours,
      due_on_date_override: dueOnDate,
      override_anchor_date: anchor,
    })
    .eq('id', scheduleId)

  if (error) return { ok: false, message: error.message }

  revalidatePath('/maintenance')
  revalidatePath('/')
  return { ok: true }
}

export async function saveScheduleIntervals(
  scheduleId: string,
  intervalHours: number | null,
  intervalMonths: number | null,
  active: boolean,
): Promise<{ ok: boolean; message?: string }> {
  await requireCrew()

  if (
    (intervalHours !== null && intervalHours <= 0) ||
    (intervalMonths !== null && intervalMonths <= 0)
  ) {
    return { ok: false, message: 'Intervals must be greater than zero.' }
  }

  const supabase = await createClient()

  // The table requires a rule of some kind. An item that recurs on a fixed
  // annual date already has one, so only interval-driven items need an
  // interval. Catching it here gives a sentence rather than a raw Postgres
  // constraint error.
  if (intervalHours === null && intervalMonths === null) {
    const { data: schedule } = await supabase
      .from('maintenance_schedule')
      .select('annual_due_month')
      .eq('id', scheduleId)
      .maybeSingle()

    if (schedule?.annual_due_month === null || schedule === null) {
      return { ok: false, message: 'Set an hour interval, a month interval, or both.' }
    }
  }

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
