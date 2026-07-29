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
  formatValue,
  emptyMessage = 'Nothing to chart yet',
}: {
  bars: Array<{ label: string; value: number }>
  height?: number
  yLabel?: string
  /** Supply to print each bar's figure above it, for charts read as amounts. */
  formatValue?: (value: number) => string
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
          .map((b) => `${b.label} ${formatValue ? formatValue(b.value) : b.value}`)
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
              {formatValue ? (
                // Above the bar, in ink rather than the bar's own colour: the
                // figure is a label, and the teal is already saying "amount".
                <text
                  x={centre}
                  y={Math.max(7, top - 4)}
                  textAnchor="middle"
                  className="fill-hull-900 text-[8px] font-semibold dark:fill-chart-100"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatValue(bar.value)}
                </text>
              ) : null}
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

/**
 * Ranked amounts, laid on their sides. One row per category: name, bar, figure.
 *
 * Horizontal because the categories here are things like "Anodes / zincs" and
 * "Thruster battery", which will not fit under a vertical bar at any size worth
 * reading, and because a ranked list is read down the page. Not a pie: one slice
 * routinely holds three quarters of the total and the rest are slivers, which is
 * exactly the shape a pie renders worst.
 *
 * The figure sits inside its bar whenever the bar is long enough to hold it.
 * Given it a column of its own on the right, that column plus the name gutter
 * ate nearly half the width and the longest bar could never reach much past the
 * middle of the card. Only the short bars need to put their figure outside, and
 * by definition those have room to spare.
 *
 * One colour throughout. Every bar measures the same thing, so a different hue
 * per row would be colour standing for nothing — the name already says which row
 * is which. Every bar is labelled rather than relying on hover, because a phone
 * at the helm has none.
 */
export function HBarChart({
  bars,
  formatValue,
  emptyMessage = 'Nothing to chart yet',
}: {
  bars: Array<{ label: string; value: number }>
  formatValue: (value: number) => string
  emptyMessage?: string
}) {
  if (bars.length === 0) return <EmptyState title={emptyMessage} />

  const ROW = 13
  const GAP = 9
  /** Enough for the longest service type this boat has; names start at zero. */
  const GUTTER = 92
  const top = 4

  const height = bars.length * (ROW + GAP) - GAP + top * 2
  const track = WIDTH - GUTTER - 2
  const largest = Math.max(...bars.map((bar) => bar.value), 0)

  return (
    <figure className="-mx-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full"
        role="img"
        aria-label={`Spend by type: ${bars
          .map((bar) => `${bar.label} ${formatValue(bar.value)}`)
          .join(', ')}`}
      >
        {bars.map((bar, index) => {
          const rowTop = top + index * (ROW + GAP)
          const width = largest > 0 ? Math.max(1, (bar.value / largest) * track) : 1
          const figure = formatValue(bar.value)
          // Roughly what the figure needs; short bars put theirs outside.
          const inside = width > figure.length * 4.6 + 12
          const baseline = rowTop + ROW - 3.5

          return (
            <g key={bar.label}>
              <text
                x={0}
                y={baseline}
                className="fill-hull-800/75 text-[8px] dark:fill-chart-200/70"
              >
                {bar.label}
              </text>
              <rect
                x={GUTTER}
                y={rowTop}
                width={width}
                height={ROW}
                rx="2"
                className="fill-shoal-500/85"
              />
              <text
                x={inside ? GUTTER + width - 5 : GUTTER + width + 5}
                y={baseline}
                textAnchor={inside ? 'end' : 'start'}
                className={
                  inside
                    ? 'fill-hull-950 text-[8px] font-semibold'
                    : 'fill-hull-900 text-[8px] font-semibold dark:fill-chart-100'
                }
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {figure}
              </text>
            </g>
          )
        })}
      </svg>
    </figure>
  )
}
