'use client'

import { useState, type FormEvent } from 'react'
import type { z } from 'zod'
import { fieldErrors } from '@/lib/validation/schemas'

/**
 * Runs the same zod schema the server action uses before the form is sent,
 * so a mismatched confirmation or a short password is caught without a round
 * trip. The server checks again regardless; this is only a convenience.
 */
export function useClientCheck(schema: z.ZodType) {
  const [errors, setErrors] = useState<Record<string, string>>({})

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    const result = schema.safeParse(Object.fromEntries(new FormData(event.currentTarget)))
    if (result.success) {
      setErrors({})
    } else {
      event.preventDefault()
      setErrors(fieldErrors(result.error))
    }
  }

  return { errors, onSubmit }
}
