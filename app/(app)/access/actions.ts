'use server'

import { revalidatePath } from 'next/cache'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { allowedEmailSchema, crewSchema } from '@/lib/validation/schemas'

export type AccessState =
  | { status: 'idle' }
  | { status: 'saved'; message: string }
  | { status: 'error'; message: string }

const UNIQUE_VIOLATION = '23505'

export async function addAllowedEmail(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const membership = await requireCrew()

  const parsed = allowedEmailSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Check the form.',
    }
  }

  const supabase = await createClient()
  // Lowercased by the schema: the table carries a check (email = lower(email))
  // constraint, and a stray capital would surface as a raw Postgres error.
  const { error } = await supabase.from('allowed_emails').insert({
    ...parsed.data,
    added_by: membership.userId,
  })

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { status: 'error', message: 'That address is already on the list.' }
    }
    return { status: 'error', message: error.message }
  }

  revalidatePath('/access')
  return {
    status: 'saved',
    message: `${parsed.data.email} can now sign in with a magic link.`,
  }
}

export async function updateAllowedEmailRole(
  email: string,
  role: 'crew' | 'viewer',
): Promise<void> {
  await requireCrew()
  const supabase = await createClient()
  // The trigger on this table propagates the change to boat_members.
  await supabase.from('allowed_emails').update({ role }).eq('email', email)
  revalidatePath('/access')
}

export async function removeAllowedEmail(email: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()
  await supabase.from('allowed_emails').delete().eq('email', email)
  revalidatePath('/access')
}

export async function saveCrewMember(
  _prev: AccessState,
  formData: FormData,
): Promise<AccessState> {
  const membership = await requireCrew()

  const parsed = crewSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Check the form.',
    }
  }

  const supabase = await createClient()
  const { id, ...values } = parsed.data

  const { error } = id
    ? await supabase.from('crew').update(values).eq('id', id)
    : await supabase.from('crew').insert({ ...values, boat_id: membership.boatId })

  if (error) return { status: 'error', message: error.message }

  revalidatePath('/crew')
  return { status: 'saved', message: `${parsed.data.name} saved.` }
}

export type CreateCrewResult =
  | { ok: true; person: { id: string; name: string } }
  | { ok: false; message: string }

/**
 * Add someone to the roster and hand back the created row.
 *
 * Separate from saveCrewMember because the trip form needs the new id to tick
 * the person onto the trip straight away, and the emergency-contact fields are
 * not worth asking for at the helm — the roster screen fills those in later.
 */
export async function createCrewMember(name: string): Promise<CreateCrewResult> {
  const membership = await requireCrew()

  const parsed = crewSchema.pick({ name: true }).safeParse({ name })
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Enter a name.',
    }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('crew')
    .insert({ name: parsed.data.name, boat_id: membership.boatId })
    .select('id, name')
    .single()

  if (error || !data) {
    return { ok: false, message: error?.message ?? 'Could not add them.' }
  }

  revalidatePath('/crew')
  return { ok: true, person: data }
}

export async function deleteCrewMember(crewId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()
  await supabase.from('crew').delete().eq('id', crewId)
  revalidatePath('/crew')
}
