'use client'

import { useState, useTransition } from 'react'
import { saveDueOverride } from '@/app/(app)/maintenance/actions'
import { Button, Card, Field, NumberInput, Pill, TextInput } from '@/components/ui/primitives'
import type { DueItem } from '@/lib/maintenance/due'

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function toNullableNumber(value: string): number | null {
  if (value.trim() === '') return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

/**
 * One schedule item, with an optional manual adjustment of when it falls due.
 *
 * The adjustment is a correction or a one-off exception, not a change of
 * interval — that lives in the interval editor further down the page. It lapses
 * on its own once the item is next logged, which the panel says out loud so
 * nobody expects a permanent change.
 */
export function ScheduleCard({
  item,
  canEdit,
}: {
  item: DueItem
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(item.dueAtHours?.toString() ?? '')
  const [date, setDate] = useState(item.dueOnDate ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const isBill = item.category === 'bill'

  function save(nextHours: number | null, nextDate: string | null) {
    const scheduleId = item.scheduleId
    if (scheduleId === null) return
    setError(null)
    startTransition(async () => {
      const result = await saveDueOverride(scheduleId, nextHours, nextDate)
      if (!result.ok) {
        setError(result.message ?? 'Could not save.')
        return
      }
      setOpen(false)
    })
  }

  function reset() {
    setHours('')
    setDate('')
    save(null, null)
  }

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{item.serviceType}</span>
        <Pill tone={item.status}>{item.status}</Pill>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="opacity-60">{isBill ? 'Last paid' : 'Last done'}</dt>
        <dd className="readout">
          {item.lastServiceDate ? shortDate(item.lastServiceDate) : 'Never'}
        </dd>
        {isBill ? null : (
          <>
            <dt className="opacity-60">Due at</dt>
            <dd className="readout">
              {item.dueAtHours !== null ? `${item.dueAtHours} h` : '—'}
            </dd>
          </>
        )}
        <dt className="opacity-60">Due by</dt>
        <dd className="readout">
          {item.dueOnDate ? shortDate(item.dueOnDate) : '—'}
        </dd>
      </dl>

      {item.overridden ? (
        <p className="text-xs text-magenta-600 dark:text-magenta-400">
          Adjusted by hand — back to normal once this is logged again.
        </p>
      ) : null}

      {canEdit && item.scheduleId !== null ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="self-start text-xs font-semibold text-magenta-600 underline underline-offset-2 dark:text-magenta-400"
          >
            {open ? 'Close' : 'Adjust due'}
          </button>

          {open ? (
            <div className="flex flex-col gap-3 border-t border-chart-300/60 pt-3 dark:border-hull-700/60">
              <p className="text-xs text-hull-700/75 dark:text-chart-200/65">
                Sets when this one falls due, leaving the interval alone. Clear a
                box to hand that measure back to the schedule.
              </p>

              <div className={isBill ? undefined : 'grid gap-3 sm:grid-cols-2'}>
                {isBill ? null : (
                  <Field label="Due at (hours)">
                    <NumberInput
                      step="1"
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                      placeholder="—"
                    />
                  </Field>
                )}
                <Field label="Due by">
                  <TextInput
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() =>
                    save(
                      isBill ? null : toNullableNumber(hours),
                      date.trim() === '' ? null : date,
                    )
                  }
                >
                  {pending ? 'Saving…' : 'Save'}
                </Button>
                {item.overridden ? (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={pending}
                    onClick={reset}
                  >
                    Back to schedule
                  </Button>
                ) : null}
              </div>

              {error ? (
                <p className="text-xs text-alarm-600 dark:text-alarm-500">{error}</p>
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}
