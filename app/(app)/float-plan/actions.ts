'use server'

import { randomBytes } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { headers } from 'next/headers'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { floatPlanSchema } from '@/lib/validation/schemas'
import { expiryFor } from '@/lib/float-plan/expiry'

export type FloatPlanFormState =
  | { status: 'idle' }
  | { status: 'created'; url: string }
  | { status: 'error'; message: string }

export async function createFloatPlan(
  _prev: FloatPlanFormState,
  formData: FormData,
): Promise<FloatPlanFormState> {
  const membership = await requireCrew()

  const parsed = floatPlanSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Check the form.',
    }
  }

  const departureAt = new Date(parsed.data.departure_at)
  const plannedReturnAt = new Date(parsed.data.planned_return_at)

  if (Number.isNaN(departureAt.getTime()) || Number.isNaN(plannedReturnAt.getTime())) {
    return { status: 'error', message: 'Those times could not be read.' }
  }
  if (plannedReturnAt <= departureAt) {
    return { status: 'error', message: 'Planned return must be after departure.' }
  }

  // Not Math.random: this token is the only thing between a URL and a list of
  // emergency phone numbers.
  const token = randomBytes(32).toString('base64url')

  const supabase = await createClient()
  const { data: plan, error } = await supabase
    .from('float_plans')
    .insert({
      boat_id: membership.boatId,
      token,
      departure_at: departureAt.toISOString(),
      planned_return_at: plannedReturnAt.toISOString(),
      expires_at: expiryFor(plannedReturnAt.toISOString()),
      departure_point: parsed.data.departure_point,
      destination_notes: parsed.data.destination_notes,
      shore_contact_name: parsed.data.shore_contact_name,
      created_by: membership.userId,
    })
    .select('id')
    .single()

  if (error || !plan) {
    return { status: 'error', message: error?.message ?? 'Could not create the plan.' }
  }

  const crewIds = formData.getAll('crew_ids').map(String).filter(Boolean)
  if (crewIds.length > 0) {
    await supabase
      .from('float_plan_crew')
      .insert(crewIds.map((crewId) => ({ float_plan_id: plan.id, crew_id: crewId })))
  }

  const origin = (await headers()).get('origin') ?? ''
  revalidatePath('/float-plan')

  return { status: 'created', url: `${origin}/fp/${token}` }
}

/** The "I'm back safe" check-in. */
export async function closeFloatPlan(planId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()
  await supabase
    .from('float_plans')
    .update({ closed_at: new Date().toISOString() })
    .eq('id', planId)
  revalidatePath('/float-plan')
}
