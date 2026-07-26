'use server'

import { cookies } from 'next/headers'
import { revalidatePath } from 'next/cache'

export type Theme = 'light' | 'dark' | 'system'

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365

/**
 * The theme lives in a cookie rather than localStorage so the server already
 * knows it while rendering — no flash of the wrong palette at dusk.
 */
export async function setTheme(theme: Theme): Promise<void> {
  const store = await cookies()

  if (theme === 'system') {
    store.delete('theme')
  } else {
    store.set('theme', theme, {
      maxAge: ONE_YEAR_SECONDS,
      sameSite: 'lax',
      path: '/',
    })
  }

  revalidatePath('/', 'layout')
}
