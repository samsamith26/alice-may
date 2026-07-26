import { createBrowserClient } from '@supabase/ssr'
import { getEnv } from '@/lib/env'
import type { Database } from './database.types'

export function createClient() {
  const env = getEnv()
  return createBrowserClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)
}
