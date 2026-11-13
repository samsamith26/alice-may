'use client'

import { useState, type ComponentProps } from 'react'
import { CONTROL } from '@/components/ui/primitives'

/**
 * A password field with a show/hide toggle. At the helm, with wet hands and
 * glare, being able to see what you typed beats retyping it blind.
 *
 * Pass the right autoComplete: "current-password" to sign in,
 * "new-password" when choosing one, so password managers fill or suggest.
 */
export function PasswordInput({
  className,
  ...rest
}: Omit<ComponentProps<'input'>, 'type'>) {
  const [shown, setShown] = useState(false)

  return (
    <div className="relative">
      <input
        {...rest}
        type={shown ? 'text' : 'password'}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className={[CONTROL, 'pr-20', className].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        onClick={() => setShown((s) => !s)}
        aria-pressed={shown}
        aria-label={shown ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex min-w-16 items-center justify-center rounded-r-md px-3 text-sm font-semibold text-magenta-500 hover:text-magenta-600"
      >
        {shown ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}
