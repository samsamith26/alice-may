'use client'

import { useState, useTransition } from 'react'
import {
  saveBillSchedule,
  saveScheduleIntervals,
} from '@/app/(app)/maintenance/actions'
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
  annual_due_month: number | null
  annual_due_day: number | null
  active: boolean
}

const UNIT_LABELS: Record<IntervalUnit, [string, string]> = {
  day: ['day', 'days'],
  week: ['week', 'weeks'],
  month: ['month', 'months'],
  year: ['year', 'years'],
}

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

function ordinal(day: number): string {
  if (day > 3 && day < 21) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
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

/**
 * How often the item comes round: "100 h · 3 months" for an interval, or
 * "1 July" for a bill on a fixed date.
 */
function cadence(intervals: ScheduleIntervals): string {
  if (intervals.annual_due_month !== null && intervals.annual_due_day !== null) {
    return `${ordinal(intervals.annual_due_day)} ${MONTHS[intervals.annual_due_month - 1]}`
  }

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
 * One schedule item, with the rule behind its due date editable in place.
 *
 * Only the rule can be changed, never the due date itself — an interval for
 * maintenance, a calendar date for a bill. Both produce their due point by
 * computation, so nothing on the card can disagree with the log behind it.
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
  const [month, setMonth] = useState(intervals.annual_due_month ?? 1)
  const [day, setDay] = useState((intervals.annual_due_day ?? 1).toString())
  const [active, setActive] = useState(intervals.active)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // A bill falls due on a date the harbour or the county sets; it has no
  // interval and no engine hours to run.
  const isBill = item.category === 'bill'

  function save() {
    setError(null)
    const scheduleId = item.scheduleId
    if (scheduleId === null) return

    startTransition(async () => {
      const result = isBill
        ? await saveBillSchedule(scheduleId, month, Number(day), active)
        : await saveScheduleIntervals(
            scheduleId,
            toNullableNumber(hours),
            toNullableNumber(count),
            toNullableNumber(count) === null ? null : unit,
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
        <dd className="readout">{item.dueOnDate ? shortDate(item.dueOnDate) : '—'}</dd>
        <dt className="opacity-60">{isBill ? 'Every year on' : 'Every'}</dt>
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
            {open ? 'Close' : isBill ? 'Change due date' : 'Change interval'}
          </button>

          {open ? (
            <div className="flex flex-col gap-3 border-t border-chart-300/60 pt-3 dark:border-hull-700/60">
              <p className="text-xs text-hull-700/75 dark:text-chart-200/65">
                {isBill
                  ? 'This bill falls due on the same date every year. Paying early or late does not move it — only changing it here does.'
                  : 'Due points are worked out from the last one logged, so changing this moves everything from here on. Leave a box empty to ignore that measure.'}
              </p>

              {isBill ? (
                <div className="grid grid-cols-[1.6fr_1fr] gap-2">
                  <Field label="Month">
                    <Select
                      value={month}
                      onChange={(event) => setMonth(Number(event.target.value))}
                    >
                      {MONTHS.map((name, index) => (
                        <option key={name} value={index + 1}>
                          {name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Day">
                    <NumberInput
                      step="1"
                      min="1"
                      max="31"
                      value={day}
                      onChange={(event) => setDay(event.target.value)}
                    />
                  </Field>
                </div>
              ) : (
                <>
                  <Field label="Every (hours)">
                    <NumberInput
                      step="1"
                      value={hours}
                      onChange={(event) => setHours(event.target.value)}
                      placeholder="—"
                    />
                  </Field>

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
                </>
              )}

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
