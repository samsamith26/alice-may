import { extent, linearScale, niceTicks } from './scale'
import { Annotation, EmptyState } from '@/components/ui/primitives'

/*
 * Hand-rolled SVG rather than a charting library: a smaller bundle over harbour
 * signal, and marks that match the instrument vocabulary instead of fighting a
 * library's defaults. These are server components — no hooks, no handlers.
 */

const WIDTH = 320
const PAD = { top: 10, right: 8, bottom: 22, left: 34 }

export type Point = { x: number; y: number; label?: string }
export type Series = { label: string; points: Point[]; tone?: 'primary' | 'secondary' }

const TONE_STROKE = {
  primary: 'stroke-magenta-500',
  secondary: 'stroke-shoal-500',
} as const

function Grid({
  ticks,
  y,
  height,
}: {
  ticks: number[]
  y: (value: number) => number
  height: number
}) {
  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-hull-800/12 dark:stroke-chart-200/12"
            strokeWidth="0.6"
          />
          <text
            x={PAD.left - 5}
            y={y(tick) + 3}
            textAnchor="end"
            className="fill-hull-800/60 text-[8px] dark:fill-chart-200/55"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {Number.isInteger(tick) ? tick : tick.toFixed(1)}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={height - PAD.bottom}
        y2={height - PAD.bottom}
        className="stroke-hull-800/30 dark:stroke-chart-200/30"
        strokeWidth="0.8"
      />
    </g>
  )
}

export function LineChart({
  series,
  height = 180,
  yLabel,
  emptyMessage = 'Not enough data yet',
}: {
  series: Series[]
  height?: number
  yLabel?: string
  emptyMessage?: string
}) {
  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length < 2) {
    return <EmptyState title={emptyMessage} />
  }

  const [xMin, xMax] = extent(allPoints.map((p) => p.x))
  const [yMin, yMax] = extent(allPoints.map((p) => p.y))
  const ticks = niceTicks(Math.min(0, yMin), yMax, 4)

  const x = linearScale([xMin, xMax], [PAD.left, WIDTH - PAD.right])
  const y = linearScale(
    [ticks[0], ticks[ticks.length - 1]],
    [height - PAD.bottom, PAD.top],
  )

  return (
    <figure className="flex flex-col gap-2">
      {yLabel ? <Annotation>{yLabel}</Annotation> : null}
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${yLabel ?? 'Chart'}: ${series.map((s) => s.label).join(', ')}`}
      >
        <Grid ticks={ticks} y={y} height={height} />
        {series.map((s) => {
          if (s.points.length < 2) return null
          const d = s.points
            .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.x).toFixed(2)} ${y(p.y).toFixed(2)}`)
            .join(' ')
          return (
            <g key={s.label}>
              <path
                d={d}
                fill="none"
                className={TONE_STROKE[s.tone ?? 'primary']}
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {s.points.map((p) => (
                <circle
                  key={`${s.label}-${p.x}`}
                  cx={x(p.x)}
                  cy={y(p.y)}
                  r="2"
                  className={
                    s.tone === 'secondary' ? 'fill-shoal-500' : 'fill-magenta-500'
                  }
                />
              ))}
            </g>
          )
        })}
      </svg>
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-4">
          {series.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className={`h-0.5 w-4 rounded ${
                  s.tone === 'secondary' ? 'bg-shoal-500' : 'bg-magenta-500'
                }`}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  )
}

export function BarChart({
  bars,
  height = 180,
  yLabel,
  emptyMessage = 'Nothing to chart yet',
}: {
  bars: Array<{ label: string; value: number }>
  height?: number
  yLabel?: string
  emptyMessage?: string
}) {
  if (bars.length === 0) return <EmptyState title={emptyMessage} />

  const ticks = niceTicks(0, Math.max(...bars.map((b) => b.value)), 4)
  const y = linearScale(
    [ticks[0], ticks[ticks.length - 1]],
    [height - PAD.bottom, PAD.top],
  )

  const usable = WIDTH - PAD.left - PAD.right
  const slot = usable / bars.length
  const barWidth = Math.max(4, Math.min(34, slot * 0.62))

  return (
    <figure className="flex flex-col gap-2">
      {yLabel ? <Annotation>{yLabel}</Annotation> : null}
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${yLabel ?? 'Chart'}: ${bars
          .map((b) => `${b.label} ${b.value}`)
          .join(', ')}`}
      >
        <Grid ticks={ticks} y={y} height={height} />
        {bars.map((bar, index) => {
          const centre = PAD.left + slot * (index + 0.5)
          const top = y(bar.value)
          return (
            <g key={bar.label}>
              <rect
                x={centre - barWidth / 2}
                y={top}
                width={barWidth}
                height={Math.max(0, height - PAD.bottom - top)}
                rx="1.5"
                className="fill-shoal-500/85"
              />
              <text
                x={centre}
                y={height - PAD.bottom + 12}
                textAnchor="middle"
                className="fill-hull-800/65 text-[8px] dark:fill-chart-200/60"
              >
                {bar.label}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
