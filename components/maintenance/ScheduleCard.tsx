'use client'

import { useState, useTransition } from 'react'
import { saveScheduleIntervals } from '@/app/(app)/maintenance/actions'
import {
  Button,
  Card,
  Field,
  NumberInput,
  Pill,
  Select,
} from '@/components/ui/primitives'
import type { DueItem, IntervalUnit } from '@/lib/maintenance/due'

export type ScheduleIntervals = {
  interval_hours: number | null
  interval_count: number | null
  interval_unit: IntervalUnit | null
  active: boolean
}

const UNIT_LABELS: Record<IntervalUnit, [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
}

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

/** "every 100 h · 3 months", or nothing if the item has no intervals at all. */
function cadence(intervals: ScheduleIntervals): string {
  const parts: string[] = []
  if (intervals.interval_hours !== null) {
    parts.push(`${intervals.interval_hours} h`)
  }
  if (intervals.interval_count !== null && intervals.interval_unit !== null) {
    const [one, many] = UNIT_LABELS[intervals.interval_unit]
    parts.push(
      `${intervals.interval_count} ${intervals.interval_count === 1 ? one : many}`,
    )
  }
  return parts.join(' · ')
}

/**
 * One schedule item, with its interval editable in place.
 *
 * The interval is the only thing that can be changed: due points are always
 * last done plus the interval, so there is nothing else to adjust and nothing
 * that can disagree with the log.
 */
export function ScheduleCard({
  item,
  intervals,
  canEdit,
}: {
  item: DueItem
  intervals: ScheduleIntervals
  canEdit: boolean
}) {
  const [open, setOpen] = useState(false)
  const [hours, setHours] = useState(intervals.interval_hours?.toString() ?? '')
  const [count, setCount] = useState(intervals.interval_count?.toString() ?? '')
  const [unit, setUnit] = useState<IntervalUnit>(intervals.interval_unit ?? 'month')
  const [active, setActive] = useState(intervals.active)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // Hour intervals only mean something for the engine. A bill has no hours to
  // run, so it gets the time interval alone.
  const showHours = item.category === 'mechanical'

  function save() {
    setError(null)
    const scheduleId = item.scheduleId
    if (scheduleId === null) return

    const nextCount = toNullableNumber(count)
    startTransition(async () => {
      const result = await saveScheduleIntervals(
        scheduleId,
        showHours ? toNullableNumber(hours) : null,
        nextCount,
        nextCount === null ? null : unit,
        active,
      )
      if (!result.ok) {
        setError(result.message ?? 'Could not save.')
        return
      }
      setOpen(false)
    })
  }

  const summary = cadence(intervals)

  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <span className="font-medium">{item.serviceType}</span>
        <Pill tone={item.status}>{item.status}</Pill>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="opacity-60">{showHours ? 'Last done' : 'Last paid'}</dt>
        <dd className="readout">
          {item.lastServiceDate ? shortDate(item.lastServiceDate) : 'Never'}
        </dd>
        {showHours ? (
          <>
            <dt className="opacity-60">Due at</dt>
            <dd className="readout">
              {item.dueAtHours !== null ? `${item.dueAtHours} h` : '—'}
            </dd>
          </>
        ) : null}
        <dt className="opacity-60">Due by</dt>
        <dd className="readout">{item.dueOnDate ? shortDate(item.dueOnDate) : '—'}</dd>
        <dt className="opacity-60">Every</dt>
        <dd className="readout">{summary === '' ? '—' : summary}</dd>
      </dl>

      {intervals.active ? null : (
        <p className="text-xs opacity-60">Not tracked.</p>
      )}

      {canEdit && item.scheduleId !== null ? (
        <>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            className="self-start text-xs font-semibold text-magenta-600 underline underline-offset-2 dark:text-magenta-400"
          >
            {open ? 'Close' : 'Change interval'}
          </button>

          {open ? (
            <div className="flex flex-col gap-3 border-t border-chart-300/60 pt-3 dark:border-hull-700/60">
              <p className="text-xs text-hull-700/75 dark:text-chart-200/65">
                Due dates are worked out from the last one logged, so changing
                this moves everything from here on. Leave a box empty to ignore
                that measure.
              </p>

              {showHours ? (
                <Field label="Every (hours)">
                  <NumberInput
                    step="1"
                    value={hours}
                    onChange={(event) => setHours(event.target.value)}
                    placeholder="—"
                  />
                </Field>
              ) : null}

              <div className="grid grid-cols-[1fr_1.3fr] gap-2">
                <Field label="Every">
                  <NumberInput
                    step="1"
                    min="1"
                    value={count}
                    onChange={(event) => setCount(event.target.value)}
                    placeholder="—"
                  />
                </Field>
                <Field label="Unit">
                  <Select
                    value={unit}
                    onChange={(event) => setUnit(event.target.value as IntervalUnit)}
                  >
                    <option value="day">days</option>
                    <option value="week">weeks</option>
                    <option value="month">months</option>
                    <option value="year">years</option>
                  </Select>
                </Field>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={(event) => setActive(event.target.checked)}
                  className="accent-magenta-500"
                />
                Tracked
              </label>
              <p className="text-xs text-hull-700/70 dark:text-chart-200/60">
                Untick to stop warning about this without deleting its history.
              </p>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={save}
                >
                  {pending ? 'Saving…' : 'Save'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
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
