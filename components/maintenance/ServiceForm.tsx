'use client'

import { useActionState } from 'react'
import { logService, type ServiceState } from '@/app/(app)/maintenance/actions'
import {
  Button,
  Field,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@/components/ui/primitives'

export function ServiceForm({
  serviceTypes,
  currentHours,
}: {
  serviceTypes: string[]
  currentHours: number | null
}) {
  const [state, formAction, pending] = useActionState<ServiceState, FormData>(
    logService,
    { status: 'idle' },
  )

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="What was done">
          <Select name="service_type" required defaultValue="">
            <option value="" disabled>
              Pick a service
            </option>
            {serviceTypes.map((type) => (
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
            defaultValue={new Date().toISOString().slice(0, 10)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Engine hours"
          hint={currentHours !== null ? `Latest logged: ${currentHours}` : undefined}
        >
          <NumberInput
            name="engine_hours_at_service"
            step="0.1"
            defaultValue={currentHours ?? ''}
          />
        </Field>
        <Field label="Cost">
          <NumberInput name="cost" step="0.01" />
        </Field>
      </div>

      <Field label="Notes">
        <Textarea name="notes" placeholder="Parts used, who did it, anything noticed." />
      </Field>

      <Button type="submit" disabled={pending}>
        {pending ? 'Saving…' : 'Log service'}
      </Button>

      {state.status === 'error' ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
      ) : null}
      {state.status === 'saved' ? (
        <p className="text-sm text-ok-600 dark:text-ok-500">Service logged.</p>
      ) : null}
    </form>
  )
}
