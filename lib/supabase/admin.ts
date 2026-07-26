import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

/**
 * Bypasses RLS entirely. Seeding and admin scripts only — never a request
 * path. If you are reaching for this inside a page or action, the answer is
 * almost certainly a policy change instead.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL

  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')

  return createSupabaseClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
