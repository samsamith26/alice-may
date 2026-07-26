import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export type Role = 'crew' | 'viewer'

export type Membership = {
  userId: string
  email: string
  boatId: string
  role: Role
}

/**
 * The signed-in user's membership, or null when signed out or signed in
 * without an allowlist match.
 *
 * Wrapped in `cache` so a layout and the page it renders share one query
 * rather than each issuing their own.
 */
export const getMembership = cache(async (): Promise<Membership | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('boat_members')
    .select('boat_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!data) return null

  return {
    userId: user.id,
    email: user.email ?? '',
    boatId: data.boat_id,
    role: data.role,
  }
})

/** Signed out redirects to login; signed in without membership to no-access. */
export async function requireMembership(): Promise<Membership> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const membership = await getMembership()
  if (!membership) redirect('/no-access')

  return membership
}

/**
 * Crew-only gate. RLS already rejects a viewer's writes; this keeps them from
 * reaching a page whose only purpose is writing.
 */
export async function requireCrew(): Promise<Membership> {
  const membership = await requireMembership()
  if (membership.role !== 'crew') redirect('/')
  return membership
}
