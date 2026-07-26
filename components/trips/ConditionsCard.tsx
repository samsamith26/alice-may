'use client'

import { useTransition } from 'react'
import { CompassRose } from './CompassRose'
import { Annotation, Banner, Button, Card, Readout } from '@/components/ui/primitives'
import { compassPoint, formatFeet, formatKnots } from '@/lib/format/units'
import type { ConditionsSnapshot, ConditionsStatus } from '@/lib/conditions/types'
import { refetchConditions } from '@/app/(app)/trips/actions'

function clockTime(isoish: string): string {
  const time = isoish.split('T')[1] ?? ''
  const [rawHours, minutes] = time.split(':')
  const hours = Number(rawHours)
  if (!Number.isFinite(hours)) return isoish
  const suffix = hours >= 12 ? 'pm' : 'am'
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes}${suffix}`
}

function Metric({
  label,
  value,
  unit,
}: {
  label: string
  value: string
  unit?: string
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <Annotation>{label}</Annotation>
      <Readout value={value} unit={unit} className="text-lg" />
    </div>
  )
}

export function ConditionsCard({
  tripId,
  snapshot,
  status,
  canRetry,
}: {
  tripId: string
  snapshot: ConditionsSnapshot | null
  status: ConditionsStatus | null
  canRetry: boolean
}) {
  const [pending, startTransition] = useTransition()

  const retry = (
    <Button
      variant="secondary"
      disabled={pending}
      onClick={() => startTransition(() => refetchConditions(tripId))}
    >
      {pending ? 'Fetching…' : 'Fetch conditions'}
    </Button>
  )

  if (!snapshot) {
    return (
      <Card className="flex flex-col gap-3">
        <Annotation>Conditions</Annotation>
        <p className="text-sm text-hull-700/80 dark:text-chart-200/70">
          {status === 'pending'
            ? 'Still fetching the conditions for this trip.'
            : 'No conditions were recorded for this trip.'}
        </p>
        {canRetry ? <div>{retry}</div> : null}
      </Card>
    )
  }

  const { wind, waves, swell, tides } = snapshot

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Annotation>Conditions</Annotation>
          <p className="readout mt-1 text-base">{snapshot.summary}</p>
        </div>
        {snapshot.at_hour ? (
          <span className="annotation text-hull-700/60 dark:text-chart-200/50">
            at {clockTime(snapshot.at_hour)}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-start">
        <CompassRose
          windDirDeg={wind.dir_deg}
          windSpeedKn={wind.speed_kn}
          swellDirDeg={swell.dir_deg}
        />

        <div className="grid w-full grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Metric
            label="Wind"
            value={
              wind.speed_kn === null
                ? '—'
                : `${formatKnots(wind.speed_kn)}${
                    wind.dir_deg === null ? '' : ` ${compassPoint(wind.dir_deg)}`
                  }`
            }
            unit={wind.speed_kn === null ? undefined : 'kt'}
          />
          <Metric label="Gusts" value={formatKnots(wind.gust_kn)} unit="kt" />
          <Metric label="Waves" value={formatFeet(waves.height_ft)} unit="ft" />
          <Metric
            label="Period"
            value={waves.period_s === null ? '—' : String(Math.round(waves.period_s))}
            unit="s"
          />
          <Metric label="Swell" value={formatFeet(swell.height_ft)} unit="ft" />
          <Metric
            label="Sea temp"
            value={snapshot.sst_f === null ? '—' : snapshot.sst_f.toFixed(1)}
            unit="°F"
          />
        </div>
      </div>

      {tides.length > 0 ? (
        <div className="flex flex-col gap-1.5 border-t border-chart-300/60 pt-3 dark:border-hull-700/60">
          <Annotation>Tides</Annotation>
          <ul className="flex flex-wrap gap-x-5 gap-y-1">
            {tides.map((tide) => (
              <li key={tide.time} className="readout text-sm">
                <span className="opacity-60">
                  {tide.type === 'H' ? 'High' : 'Low'}
                </span>{' '}
                {clockTime(tide.time)}{' '}
                <span className="opacity-60">{tide.height_ft.toFixed(1)}ft</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {status === 'partial' ? (
        <Banner tone="soon">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Some sources didn&rsquo;t respond, so parts of this record are
              missing.
            </span>
            {canRetry ? retry : null}
          </div>
        </Banner>
      ) : null}
    </Card>
  )
}
