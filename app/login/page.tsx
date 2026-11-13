'use client'

import Link from 'next/link'
import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from './actions'
import { IDLE, type AuthFormState } from '@/lib/auth/form-state'
import { signInSchema } from '@/lib/validation/schemas'
import { AuthLinks, AuthShell, FormMessage, linkClass } from '@/components/auth/AuthShell'
import { PasswordInput } from '@/components/auth/PasswordInput'
import { useClientCheck } from '@/components/auth/useClientCheck'
import { Button, Field, TextInput } from '@/components/ui/primitives'

const LINK_ERRORS: Record<string, string> = {
  missing_token:
    'That link was incomplete. Open it straight from the email, or ask for another.',
  link_expired:
    'That link has expired or was already used. Sign in below, or ask for a new one.',
}

function LoginForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(signIn, IDLE)
  const { errors, onSubmit } = useClientCheck(signInSchema)
  const linkError = LINK_ERRORS[useSearchParams().get('error') ?? '']
  const fields = state.status === 'error' ? state.fields : undefined

  return (
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

      <Field label="Password" error={errors.password ?? fields?.password}>
        <PasswordInput name="password" autoComplete="current-password" required />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>

      {linkError && state.status === 'idle' ? (
        <FormMessage tone="error">{linkError}</FormMessage>
      ) : null}
      {state.status === 'error' && state.message ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : null}

      <Link href="/forgot-password" className={`${linkClass} self-start`}>
        Forgot your password?
      </Link>
    </form>
  )
}

export default function LoginPage() {
  return (
    <AuthShell intro="The logbook. Sign in with your email and password.">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>

      <AuthLinks>
        <p>
          <span className="font-semibold text-chart-100">First time using a password?</span>{' '}
          If you&rsquo;ve signed in here before with an emailed link, your account
          already exists &mdash;{' '}
          <Link href="/forgot-password" className={linkClass}>
            set one here
          </Link>
          .
        </p>
        <p>
          Never signed in before?{' '}
          <Link href="/signup" className={linkClass}>
            Create an account
          </Link>{' '}
          with the address Sam added for you.
        </p>
      </AuthLinks>
    </AuthShell>
  )
}
