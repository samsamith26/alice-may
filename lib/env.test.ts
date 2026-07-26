import { describe, expect, it } from 'vitest'
import { readEnv } from './env'

describe('readEnv', () => {
  it('returns the values when both are present', () => {
    expect(
      readEnv({
        NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
      }),
    ).toEqual({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_ANON_KEY: 'anon' })
  })

  it('names the specific missing variable', () => {
    expect(() => readEnv({ NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co' })).toThrow(
      /NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
  })

  it('names every missing variable at once', () => {
    expect(() => readEnv({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY/,
    )
  })
})
