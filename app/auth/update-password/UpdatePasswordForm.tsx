'use client'

import { useActionState } from 'react'
import { updatePassword } from './actions'
import { IDLE, type AuthFormState } from '@/lib/auth/form-state'
import { PASSWORD_MIN, updatePasswordSchema } from '@/lib/validation/schemas'
import { FormMessage } from '@/components/auth/AuthShell'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { useClientCheck } from '@/components/auth/useClientCheck'
import { Button, Field } from '@/components/ui/primitives'

export function UpdatePasswordForm({ email }: { email: string }) {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    updatePassword,
    IDLE,
  )
  const { errors, onSubmit } = useClientCheck(updatePasswordSchema)
  const fields = state.status === 'error' ? state.fields : undefined

  return (
    <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {/* Lets a password manager file the new password under the right account. */}
      <input
        type="email"
        name="username"
        autoComplete="username"
        value={email}
        readOnly
        hidden
      />

      <Field
        label="New password"
        hint={`At least ${PASSWORD_MIN} characters.`}
        error={errors.password ?? fields?.password}
      >
        <PasswordInput
          name="password"
          autoComplete="new-password"
          minLength={PASSWORD_MIN}
          required
        />
      </Field>

      <Field label="Confirm password" error={errors.confirm_password ?? fields?.confirm_password}>
        <PasswordInput name="confirm_password" autoComplete="new-password" required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save password'}
      </Button>

      {state.status === 'error' && state.message ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : null}
    </form>
  )
}
