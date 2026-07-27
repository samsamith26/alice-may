'use client'

import { useActionState, useEffect } from 'react'
import { logService, type ServiceState } from '@/app/(app)/maintenance/actions'
import {
  Button,
  Field,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@/components/ui/primitives'

export type ServiceEntryValues = {
  id: string
  service_date: string
  service_type: string
  engine_hours_at_service: number | null
  cost: number | null
  performed_by: string | null
  notes: string | null
}

export function ServiceForm({
  serviceTypes,
  currentHours,
  entry,
  onSaved,
  onCancel,
}: {
  serviceTypes: string[]
  currentHours: number | null
  /** Present when editing an existing entry rather than logging a new one. */
  entry?: ServiceEntryValues
  onSaved?: () => void
  onCancel?: () => void
}) {
  const [state, formAction, pending] = useActionState<ServiceState, FormData>(
    logService,
    { status: 'idle' },
  )

  useEffect(() => {
    if (state.status === 'saved') onSaved?.()
  }, [state.status, onSaved])

  // An entry may name a service type that is no longer on the schedule; keep it
  // selectable so editing an old record cannot silently rewrite what was done.
  const options =
    entry && !serviceTypes.includes(entry.service_type)
      ? [...serviceTypes, entry.service_type]
      : serviceTypes

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="id" defaultValue={entry?.id ?? ''} />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What was done">
          <Select
            name="service_type"
            required
            defaultValue={entry?.service_type ?? ''}
          >
            <option value="" disabled>
              Pick a service
            </option>
            {options.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
            <option value="Other">Other</option>
          </Select>
        </Field>
        <Field label="Date">
          <TextInput
            name="service_date"
            type="date"
            required
            defaultValue={entry?.service_date ?? new Date().toISOString().slice(0, 10)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Engine hours"
          hint={
            entry || currentHours === null
              ? undefined
              : `Latest logged: ${currentHours}`
          }
        >
          <NumberInput
            name="engine_hours_at_service"
            step="0.1"
            defaultValue={entry?.engine_hours_at_service ?? currentHours ?? ''}
          />
        </Field>
        <Field label="Cost">
          <NumberInput name="cost" step="0.01" defaultValue={entry?.cost ?? ''} />
        </Field>
      </div>

      <Field
        label="Performed by / where"
        hint="Optional — a yard, a shop, or yourself."
      >
        <TextInput
          name="performed_by"
          defaultValue={entry?.performed_by ?? ''}
          placeholder="Monterey Bay Boat Works, West Marine, self"
        />
      </Field>

      <Field label="Notes">
        <Textarea
          name="notes"
          defaultValue={entry?.notes ?? ''}
          placeholder="Parts used, anything noticed."
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : entry ? 'Save changes' : 'Log service'}
        </Button>
        {onCancel ? (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>

      {state.status === 'error' ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
      ) : null}
      {state.status === 'saved' && !entry ? (
        <p className="text-sm text-ok-600 dark:text-ok-500">Service logged.</p>
      ) : null}
    </form>
  )
}
