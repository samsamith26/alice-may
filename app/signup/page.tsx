'use client'

import Link from 'next/link'
import { useActionState } from 'react'
import { signUp } from './actions'
import { IDLE, type AuthFormState } from '@/lib/auth/form-state'
import { PASSWORD_MIN, signUpSchema } from '@/lib/validation/schemas'
import { AuthLinks, AuthShell, FormMessage, linkClass } from '@/components/auth/AuthShell'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { useClientCheck } from '@/components/auth/useClientCheck'
import { Button, Field, TextInput } from '@/components/ui/primitives'

export default function SignupPage() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signUp, IDLE)
  const { errors, onSubmit } = useClientCheck(signUpSchema)
  const fields = state.status === 'error' ? state.fields : undefined

  return (
    <AuthShell
      heading="Create an account"
      intro="For an address Sam has already added to the crew list. We’ll email you a link to confirm it’s yours."
    >
      {state.status === 'sent' ? (
        <FormMessage tone="ok">{state.message}</FormMessage>
      ) : (
        <form action={formAction} onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field label="Email" error={errors.email ?? fields?.email}>
            <TextInput
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              required
              placeholder="you@example.com"
              defaultValue={state.status === 'error' ? state.email : undefined}
            />
          </Field>

          <Field
            label="Password"
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

          <Field
            label="Confirm password"
            error={errors.confirm_password ?? fields?.confirm_password}
          >
            <PasswordInput name="confirm_password" autoComplete="new-password" required />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? 'Creating…' : 'Create account'}
          </Button>

          {state.status === 'error' && state.message ? (
            <FormMessage tone="error">{state.message}</FormMessage>
          ) : null}
        </form>
      )}

      <AuthLinks>
        <p>
          Used the logbook before?{' '}
          <Link href="/forgot-password" className={linkClass}>
            Set a password
          </Link>{' '}
          for your existing account instead.
        </p>
        <p>
          <Link href="/login" className={linkClass}>
            Back to sign in
          </Link>
        </p>
      </AuthLinks>
    </AuthShell>
  )
}
