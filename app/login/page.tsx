'use client'

import { useActionState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { requestMagicLink, type LoginState } from './actions'
import { Annotation, Button, Field, TextInput } from '@/components/ui/primitives'

const LINK_ERRORS: Record<string, string> = {
  missing_code: 'That link was incomplete. Request a new one below.',
  missing_token: 'That link was incomplete. Request a new one below.',
  link_expired: 'That link has expired or was already used. Request a new one.',
}

function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(
    requestMagicLink,
    { status: 'idle' },
  )
  const linkError = LINK_ERRORS[useSearchParams().get('error') ?? '']

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field label="Email">
        <TextInput
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          placeholder="you@example.com"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send sign-in link'}
      </Button>

      {linkError && state.status === 'idle' ? (
        <p className="text-sm text-alarm-500">{linkError}</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-sm text-alarm-500">{state.message}</p>
      ) : null}
      {state.status === 'sent' ? (
        <p className="text-sm text-shoal-300">{state.message}</p>
      ) : null}
    </form>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col justify-center bg-hull-950 px-6 py-16 text-chart-100">
      <div className="mx-auto w-full max-w-sm">
        <Annotation className="text-shoal-300">Monterey Harbor</Annotation>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">Alice May</h1>
        <p className="mt-3 text-sm text-chart-200/70">
          The logbook. Sign in with a link sent to your email — there is no
          password to remember.
        </p>

        <div className="mt-8">
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  )
}
