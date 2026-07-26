'use client'

import { useActionState } from 'react'
import { saveDocument, type DocumentState } from '@/app/(app)/documents/actions'
import { Button, Field, Select, TextInput } from '@/components/ui/primitives'

const TYPES = [
  'Registration',
  'Insurance',
  'USCG documentation',
  'Towing membership',
  'Other',
] as const

export function DocumentForm() {
  const [state, formAction, pending] = useActionState<DocumentState, FormData>(
    saveDocument,
    { status: 'idle' },
  )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select name="type" required defaultValue="Registration">
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expires on" hint="Leave blank if it doesn't expire.">
          <TextInput name="expires_on" type="date" />
        </Field>
      </div>

      <Field label="Label">
        <TextInput name="label" placeholder="Policy number, provider, anything useful" />
      </Field>

      <Field label="File" hint="PDF or a photo, up to 10 MB.">
        <input
          type="file"
          name="file"
          accept="application/pdf,image/*"
          className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-hull-800/10 file:px-4 file:text-sm file:font-semibold dark:file:bg-chart-100/10"
        />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Save document'}
      </Button>

      {state.status === 'error' ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
      ) : null}
      {state.status === 'saved' ? (
        <p className="text-sm text-ok-600 dark:text-ok-500">Document saved.</p>
      ) : null}
    </form>
  )
}
