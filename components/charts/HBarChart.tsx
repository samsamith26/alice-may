'use client'

import {
  useCallback,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import {
  ChartTooltip,
  INTERACTIVE_SVG,
  TooltipHeading,
  toViewBox,
  useDismissOnOutsideTap,
} from './ChartTooltip'
import { WIDTH } from './frame'
import { EmptyState } from '@/components/ui/primitives'

const ROW = 13
const GAP = 9
/**
 * Sized to the longest name the schedule can produce — "Engine oil & filter"
 * and its kin, around 68 units at this size — plus a little air. It was 112,
 * which left a band of nothing down the left of every row and took that width
 * straight off the bars.
 */
const GUTTER = 76
/** Enough for "$15,236" and the gap before it, and not a unit more. */
const VALUE_SPACE = 40
const TOP = 4

/**
 * Ranked amounts, laid on their sides.
 *
 * Horizontal because the categories here are things like "Anodes / zincs" and
 * "Thruster battery", which will not fit under a vertical bar at any size worth
 * reading, and because a ranked list is read down the page. Not a pie: one slice
 * routinely holds three quarters of the total and the rest are slivers, which is
 * exactly the shape a pie renders worst.
 *
 * One colour throughout. Every bar measures the same thing, so a different hue
 * per row would be colour standing for nothing — the label already carries which
 * row is which. Figures are printed on every bar because there are few enough
 * rows for that to stay quiet, and because a boat at the helm has no hover.
 *
 * A client component — its only caller (SpendByType) is one already, so the
 * formatter can be passed straight in. Tapping or hovering a row shows its
 * figure in the same tooltip as the other charts, for consistency.
 */
export function HBarChart({
  bars,
  formatValue,
  emptyMessage = 'Nothing to chart yet',
  tooltip = true,
}: {
  bars: Array<{ label: string; value: number }>
  formatValue: (value: number) => string
  emptyMessage?: string
  /** False when the figures printed on the bars already say it all. */
  tooltip?: boolean
}) {
  const tooltipId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const clear = useCallback(() => setActive(null), [])
  useDismissOnOutsideTap(wrapRef, active !== null, clear)

  if (bars.length === 0) return <EmptyState title={emptyMessage} />

  const height = bars.length * (ROW + GAP) - GAP + TOP * 2
  const track = WIDTH - GUTTER - VALUE_SPACE
  const largest = Math.max(...bars.map((bar) => bar.value), 0)
  const rowTop = (index: number) => TOP + index * (ROW + GAP)
  const widthOf = (value: number) =>
    largest > 0 ? Math.max(1, (value / largest) * track) : 1

  /** The whole row is the hit area, label and empty track included. */
  function rowAt(event: { clientX: number; clientY: number }): number | null {
    const point = toViewBox(svgRef.current, event)
    if (!point) return null
    const index = Math.floor((point.y - TOP + GAP / 2) / (ROW + GAP))
    return index >= 0 && index < bars.length ? index : null
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'mouse') return
    const index = rowAt(event)
    if (index !== null) setActive(index)
  }

  function onClick(event: MouseEvent<SVGSVGElement>) {
    const index = rowAt(event)
    setActive(index === active ? null : index)
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const last = bars.length - 1
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
      event.preventDefault()
      setActive(active === null ? 0 : Math.min(last, active + 1))
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
      event.preventDefault()
      setActive(active === null ? 0 : Math.max(0, active - 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(last)
    } else if (event.key === 'Escape') {
      setActive(null)
    }
  }

  function onFocus(event: FocusEvent<SVGSVGElement>) {
    if (active === null && event.currentTarget.matches(':focus-visible')) setActive(0)
  }

  const current = active === null ? null : bars[active]

  return (
    <figure>
      <div
        ref={wrapRef}
        className="relative"
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') setActive(null)
        }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${WIDTH} ${height}`}
          className={INTERACTIVE_SVG}
          // With the tooltip off the chart is a picture: no stop in the tab order,
          // no handlers, so nothing can become active, highlight, or look clickable.
          {...(tooltip
            ? {
                style: { cursor: current ? 'pointer' : 'default' },
                role: 'group',
                'aria-roledescription': 'chart',
                'aria-label': `Spend by type: ${bars
            .map((bar) => `${bar.label} ${formatValue(bar.value)}`)
            .join(', ')}. Use the arrow keys to step through the rows.`,
                'aria-describedby': current ? tooltipId : undefined,
                tabIndex: 0,
                onPointerMove,
                onClick,
                onKeyDown,
                onFocus,
              }
            : { role: 'img', 'aria-label': `Spend by type: ${bars
            .map((bar) => `${bar.label} ${formatValue(bar.value)}`)
            .join(', ')}` })}
        >
          {active !== null ? (
            <rect
              x={0}
              y={rowTop(active) - GAP / 2 + 1}
              width={WIDTH}
              height={ROW + GAP - 2}
              rx="3"
              className="fill-hull-800/6 dark:fill-chart-100/6"
            />
          ) : null}

          {bars.map((bar, index) => {
            const top = rowTop(index)
            const width = widthOf(bar.value)
            const lit = index === active
            return (
              <g key={bar.label}>
                <text
                  x={GUTTER - 6}
                  y={top + ROW - 3}
                  textAnchor="end"
                  className={
                    lit
                      ? 'fill-hull-900 text-[8px] font-semibold dark:fill-chart-100'
                      : 'fill-hull-800/75 text-[8px] dark:fill-chart-200/70'
                  }
                >
                  {bar.label}
                </text>
                <rect
                  x={GUTTER}
                  y={top}
                  width={width}
                  height={ROW}
                  rx="2"
                  className={lit ? 'fill-shoal-500' : 'fill-shoal-500/85'}
                />
                <text
                  x={GUTTER + width + 5}
                  y={top + ROW - 3}
                  className="fill-hull-900 text-[8px] font-semibold dark:fill-chart-100"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {formatValue(bar.value)}
                </text>
              </g>
            )
          })}
        </svg>

        {current && active !== null ? (
          <ChartTooltip
            id={tooltipId}
            wrapRef={wrapRef}
            svgRef={svgRef}
            viewHeight={height}
            placementKey={active}
            // Clear the whole row, centred on the bar's end where the eye is.
            anchor={{
              x: GUTTER + widthOf(current.value) / 2,
              y: rowTop(active),
              yEnd: rowTop(active) + ROW,
              fallbackY: rowTop(active),
            }}
          >
            <TooltipHeading title={current.label} />
            <p className="readout pb-0.5 text-sm font-semibold">
              {formatValue(current.value)}
            </p>
          </ChartTooltip>
        ) : null}
      </div>
    </figure>
  )
}
