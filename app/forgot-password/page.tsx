'use client'

import Link from 'next/link'
import { Suspense, useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { requestPasswordLink } from './actions'
import { IDLE, type AuthFormState } from '@/lib/auth/form-state'
import { forgotPasswordSchema } from '@/lib/validation/schemas'
import { AuthLinks, AuthShell, FormMessage, linkClass } from '@/components/auth/AuthShell'
import { useClientCheck } from '@/components/auth/useClientCheck'
import { Button, Field, TextInput } from '@/components/ui/primitives'

const LINK_ERRORS: Record<string, string> = {
  missing_token: 'That link was incomplete. Ask for a new one below.',
  link_expired: 'That link has expired or was already used. Ask for a new one below.',
  session_missing: 'Open the link from your email to set a password. Ask for one below.',
}

function ForgotForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    requestPasswordLink,
    IDLE,
  )
  const { errors, onSubmit } = useClientCheck(forgotPasswordSchema)
  const linkError = LINK_ERRORS[useSearchParams().get('error') ?? '']
  const fields = state.status === 'error' ? state.fields : undefined

  if (state.status === 'sent') {
    return <FormMessage tone="ok">{state.message}</FormMessage>
  }

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

      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Email me a link'}
      </Button>

      {linkError && state.status === 'idle' ? (
        <FormMessage tone="error">{linkError}</FormMessage>
      ) : null}
      {state.status === 'error' && state.message ? (
        <FormMessage tone="error">{state.message}</FormMessage>
      ) : null}
    </form>
  )
}

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      heading="Set a password"
      intro="For a forgotten password, or your first one if you used to sign in with an emailed link. We’ll send a link to choose it."
    >
      <Suspense fallback={null}>
        <ForgotForm />
      </Suspense>

      <AuthLinks>
        <p>
          Never used the logbook before? Nothing will arrive &mdash;{' '}
          <Link href="/signup" className={linkClass}>
            create an account
          </Link>{' '}
          instead.
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
