'use client'

import { useActionState } from 'react'
import {
  createFloatPlan,
  type FloatPlanFormState,
} from '@/app/(app)/float-plan/actions'
import {
  Annotation,
  Button,
  Field,
  TextInput,
  Textarea,
} from '@/components/ui/primitives'
import { CopyButton } from './ShareLink'

function localInput(offsetHours: number): string {
  const date = new Date(Date.now() + offsetHours * 3600_000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

export function FloatPlanForm({
  crewOptions,
}: {
  crewOptions: Array<{ id: string; label: string }>
}) {
  const [state, formAction, pending] = useActionState<FloatPlanFormState, FormData>(
    createFloatPlan,
    { status: 'idle' },
  )

  if (state.status === 'created') {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm">
          Filed. Send this link to whoever&rsquo;s staying ashore.
        </p>
        <CopyButton url={state.url} />
      </div>
    )
  }

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Leaving">
          <TextInput
            name="departure_at"
            type="datetime-local"
            required
            defaultValue={localInput(0)}
          />
        </Field>
        <Field label="Back by">
          <TextInput
            name="planned_return_at"
            type="datetime-local"
            required
            defaultValue={localInput(6)}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Leaving from">
          <TextInput name="departure_point" defaultValue="Monterey Harbor" />
        </Field>
        <Field label="Shore contact">
          <TextInput name="shore_contact_name" placeholder="Who has this link" />
        </Field>
      </div>

      <Field label="Where you're headed">
        <Textarea
          name="destination_notes"
          placeholder="Out to the buoy, diving Metridium, back along the breakwater."
        />
      </Field>

      <div className="flex flex-col gap-2">
        <Annotation>Aboard</Annotation>
        {crewOptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {crewOptions.map((option) => (
              <label
                key={option.id}
                className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-hull-800/20 px-3 text-sm has-checked:border-magenta-500 has-checked:bg-magenta-500/10 dark:border-chart-200/20"
              >
                <input
                  type="checkbox"
                  name="crew_ids"
                  value={option.id}
                  className="accent-magenta-500"
                />
                {option.label}
              </label>
            ))}
          </div>
        ) : (
          <p className="text-sm opacity-70">
            Add people under More → Crew roster so their emergency contacts
            appear on the plan.
          </p>
        )}
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Filing…' : 'File float plan'}
      </Button>

      {state.status === 'error' ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
      ) : null}
    </form>
  )
}
