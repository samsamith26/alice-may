'use server'

import { revalidatePath } from 'next/cache'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { poiSchema } from '@/lib/validation/schemas'

export type PoiState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string }

export async function savePoi(
  _prev: PoiState,
  formData: FormData,
): Promise<PoiState> {
  const membership = await requireCrew()

  const parsed = poiSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Check the form.',
    }
  }

  const supabase = await createClient()
  const { id, ...values } = parsed.data

  const { error } = id
    ? await supabase.from('points_of_interest').update(values).eq('id', id)
    : await supabase.from('points_of_interest').insert({
        ...values,
        boat_id: membership.boatId,
        created_by: membership.userId,
      })

  if (error) return { status: 'error', message: error.message }

  revalidatePath('/map')
  return { status: 'saved' }
}

export async function deletePoi(siteId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()
  await supabase.from('points_of_interest').delete().eq('id', siteId)
  revalidatePath('/map')
}
