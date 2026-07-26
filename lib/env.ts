type RawEnv = Record<string, string | undefined>

export type AppEnv = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
}

/**
 * Reads the public Supabase configuration, failing loudly and by name.
 *
 * Kept separate from the module-level `env` export so it can be tested without
 * mutating `process.env`.
 */
export function readEnv(raw: RawEnv): AppEnv {
  const url = raw.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = raw.NEXT_PUBLIC_SUPABASE_ANON_KEY

  const missing = [
    !url && 'NEXT_PUBLIC_SUPABASE_URL',
    !anonKey && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((name): name is string => typeof name === 'string')

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`)
  }

  return { SUPABASE_URL: url!, SUPABASE_ANON_KEY: anonKey! }
}

let cached: AppEnv | null = null

/**
 * Resolved on first use rather than at import time, so that importing a module
 * which happens to touch config never throws — only actually needing the
 * config does.
 */
export function getEnv(): AppEnv {
  if (!cached) {
    cached = readEnv({
      // Referenced statically so Next.js can inline them into the client bundle.
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    })
  }
  return cached
}
