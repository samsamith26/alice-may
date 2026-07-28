'use client'

import { useState, useTransition } from 'react'
import { saveScheduleIntervals } from '@/app/(app)/maintenance/actions'
import { Annotation, Button, Card, Field, NumberInput } from '@/components/ui/primitives'

export type ScheduleRow = {
  id: string
  service_type: string
  interval_hours: number | null
  interval_months: number | null
  active: boolean
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function ScheduleRowEditor({ row }: { row: ScheduleRow }) {
  const [hours, setHours] = useState(row.interval_hours?.toString() ?? '')
  const [months, setMonths] = useState(row.interval_months?.toString() ?? '')
  const [active, setActive] = useState(row.active)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [pending, startTransition] = useTransition()

  function save() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      const result = await saveScheduleIntervals(
        row.id,
        toNullableNumber(hours),
        toNullableNumber(months),
        active,
      )
      if (result.ok) {
        setSaved(true)
      } else {
        setError(result.message ?? 'Could not save.')
      }
    })
  }

  const dirty =
    hours !== (row.interval_hours?.toString() ?? '') ||
    months !== (row.interval_months?.toString() ?? '') ||
    active !== row.active

  return (
    <div className="flex flex-col gap-2 border-b border-chart-300/60 pb-4 last:border-0 last:pb-0 dark:border-hull-700/60">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium">{row.service_type}</span>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={active}
            onChange={(event) => setActive(event.target.checked)}
            className="accent-magenta-500"
          />
          Tracked
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Every (hours)">
          <NumberInput
            step="1"
            value={hours}
            onChange={(event) => setHours(event.target.value)}
            placeholder="—"
          />
        </Field>
        <Field label="Every (months)">
          <NumberInput
            step="1"
            value={months}
            onChange={(event) => setMonths(event.target.value)}
            placeholder="—"
          />
        </Field>
        <Button
          type="button"
          variant="secondary"
          disabled={pending || !dirty}
          onClick={save}
        >
          {pending ? 'Saving…' : 'Save'}
        </Button>
      </div>

      {error ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{error}</p>
      ) : null}
      {saved && !dirty ? (
        <p className="text-sm text-ok-600 dark:text-ok-500">Interval updated.</p>
      ) : null}
    </div>
  )
}

export function ScheduleEditor({ rows }: { rows: ScheduleRow[] }) {
  const [open, setOpen] = useState(false)

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Annotation>Service intervals</Annotation>
        <Button
          type="button"
          variant="secondary"
          className="min-h-10 px-3 text-xs"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
        >
          {open ? 'Done' : 'Change intervals'}
        </Button>
      </div>

      {open ? (
        <>
          <p className="text-sm text-hull-700/75 dark:text-chart-200/65">
            Whichever comes first triggers. Leave a box empty to ignore that
            measure — an impeller is seasonal, oil is hourly. Untick Tracked to
            stop warning about a service without deleting its history. Bills
            recur on a fixed date instead, so they are not listed here.
          </p>
          <div className="flex flex-col gap-4">
            {rows.map((row) => (
              <ScheduleRowEditor key={row.id} row={row} />
            ))}
          </div>
        </>
      ) : null}
    </Card>
  )
}
