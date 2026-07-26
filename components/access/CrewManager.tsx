'use client'

import { useActionState, useTransition } from 'react'
import {
  deleteCrewMember,
  saveCrewMember,
  type AccessState,
} from '@/app/(app)/access/actions'
import {
  Annotation,
  Button,
  Card,
  Field,
  TextInput,
} from '@/components/ui/primitives'

type Person = {
  id: string
  name: string
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
}

export function CrewManager(
  props: { mode: 'row'; person: Person } | { mode: 'form' },
) {
  const [state, formAction, pending] = useActionState<AccessState, FormData>(
    saveCrewMember,
    { status: 'idle' },
  )
  const [deleting, startDelete] = useTransition()

  if (props.mode === 'row') {
    return (
      <button
        type="button"
        disabled={deleting}
        onClick={() => startDelete(() => deleteCrewMember(props.person.id))}
        className="mt-1 self-start text-sm font-medium text-alarm-600 underline dark:text-alarm-500"
      >
        {deleting ? 'Removing…' : 'Remove'}
      </button>
    )
  }

  return (
    <Card className="flex flex-col gap-4">
      <Annotation>Add someone to the roster</Annotation>
      <form action={formAction} className="flex flex-col gap-3">
        <Field label="Name">
          <TextInput name="name" required placeholder="Who comes aboard" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Emergency contact">
            <TextInput name="emergency_contact_name" placeholder="Who to call" />
          </Field>
          <Field label="Their phone">
            <TextInput name="emergency_contact_phone" type="tel" inputMode="tel" />
          </Field>
        </div>

        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Add to roster'}
        </Button>

        {state.status === 'error' ? (
          <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
        ) : null}
        {state.status === 'saved' ? (
          <p className="text-sm text-ok-600 dark:text-ok-500">{state.message}</p>
        ) : null}
      </form>
    </Card>
  )
}
