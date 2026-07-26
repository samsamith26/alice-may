'use client'

import { useActionState, useState, useTransition } from 'react'
import {
  addAllowedEmail,
  removeAllowedEmail,
  updateAllowedEmailRole,
  type AccessState,
} from '@/app/(app)/access/actions'
import {
  Annotation,
  Button,
  Card,
  Field,
  Pill,
  Select,
  TextInput,
} from '@/components/ui/primitives'

type Row = { email: string; role: 'crew' | 'viewer'; note: string | null }

function RowActions({ row, isSelf }: { row: Row; isSelf: boolean }) {
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label={`Role for ${row.email}`}
        value={row.role}
        disabled={pending || isSelf}
        onChange={(event) =>
          startTransition(() =>
            updateAllowedEmailRole(
              row.email,
              event.target.value as 'crew' | 'viewer',
            ),
          )
        }
        className="min-h-11 w-auto text-sm"
      >
        <option value="crew">Crew</option>
        <option value="viewer">Viewer</option>
      </Select>

      {isSelf ? (
        <span className="text-xs opacity-60">That&rsquo;s you</span>
      ) : confirming ? (
        <>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-sm font-medium underline"
          >
            Keep
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(() => removeAllowedEmail(row.email))}
            className="text-sm font-semibold text-alarm-600 underline dark:text-alarm-500"
          >
            {pending ? 'Removing…' : 'Remove access now'}
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="text-sm font-medium text-alarm-600 underline dark:text-alarm-500"
        >
          Remove
        </button>
      )}
    </div>
  )
}

export function AccessManager({
  rows,
  currentEmail,
  signedInCount,
}: {
  rows: Row[]
  currentEmail: string
  signedInCount: number
}) {
  const [state, formAction, pending] = useActionState<AccessState, FormData>(
    addAllowedEmail,
    { status: 'idle' },
  )
  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-4">
        <Annotation>Add someone</Annotation>
        <form action={formAction} className="flex flex-col gap-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
            <Field label="Email">
              <TextInput
                name="email"
                type="email"
                required
                placeholder="them@example.com"
                autoComplete="off"
              />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="viewer">
                <option value="crew">Crew</option>
                <option value="viewer">Viewer</option>
              </Select>
            </Field>
          </div>
          <Field label="Note" hint="Optional — how you know them.">
            <TextInput name="note" placeholder="Dad" />
          </Field>

          <Button type="submit" disabled={pending}>
            {pending ? 'Adding…' : 'Add to the list'}
          </Button>

          {state.status === 'error' ? (
            <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
          ) : null}
          {state.status === 'saved' ? (
            <p className="text-sm text-ok-600 dark:text-ok-500">{state.message}</p>
          ) : null}
        </form>
      </Card>

      <div>
        <div className="flex items-baseline justify-between">
          <Annotation>On the list</Annotation>
          <Annotation>{signedInCount} signed in so far</Annotation>
        </div>

        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.email}>
              <Card className="flex flex-col gap-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.email}</p>
                    {row.note ? (
                      <p className="text-sm opacity-70">{row.note}</p>
                    ) : null}
                  </div>
                  <Pill tone={row.role === 'crew' ? 'ok' : 'neutral'}>{row.role}</Pill>
                </div>
                <RowActions row={row} isSelf={row.email === currentEmail} />
              </Card>
            </li>
          ))}
        </ul>

        <p className="mt-3 text-xs text-hull-700/70 dark:text-chart-200/60">
          Removing an address revokes that person&rsquo;s access straight away,
          including if they&rsquo;re signed in right now.
        </p>
      </div>
    </div>
  )
}
