'use client'

import { useRouter } from 'next/navigation'
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
import { Grid, PAD, WIDTH } from './frame'
import { linearScale, niceTicks } from './scale'

/**
 * A bar as the client needs it: every string already formatted on the
 * server, because formatter functions cannot cross to a client component.
 */
export type PlottedBar = {
  /** Under the bar. */
  label: string
  value: number
  /** Above the bar, when the chart prints its figures. */
  above?: string
  /** The tooltip's heading. */
  title: string
  /** The tooltip's figure. */
  valueText: string
  /** A page the tooltip links to, and a second tap opens. */
  href?: string
}

export function BarChartCanvas({
  bars,
  height,
  ariaLabel,
  tooltip = true,
}: {
  bars: PlottedBar[]
  height: number
  ariaLabel: string
  /** False for charts whose figures are already printed on the bars. */
  tooltip?: boolean
}) {
  const router = useRouter()
  const tooltipId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [active, setActive] = useState<number | null>(null)

  const ticks = niceTicks(0, Math.max(...bars.map((b) => b.value)), 4)
  const y = linearScale([ticks[0], ticks[ticks.length - 1]], [height - PAD.bottom, PAD.top])
  const usable = WIDTH - PAD.left - PAD.right
  const slot = usable / bars.length
  const barWidth = Math.max(4, Math.min(34, slot * 0.62))
  const centreOf = (index: number) => PAD.left + slot * (index + 0.5)
  const baseline = height - PAD.bottom

  const clear = useCallback(() => setActive(null), [])
  useDismissOnOutsideTap(wrapRef, active !== null, clear)

  /**
   * The whole column is the hit area — from the top of the plot down through
   * the label — so a bar a few units tall is as easy to tap as the tallest.
   */
  function columnAt(event: { clientX: number; clientY: number }): number | null {
    const point = toViewBox(svgRef.current, event)
    if (!point || point.y < PAD.top - 4 || point.y > height) return null
    const index = Math.floor((point.x - PAD.left) / slot)
    return index >= 0 && index < bars.length ? index : null
  }

  function open(index: number) {
    const href = bars[index]?.href
    if (href) router.push(href)
  }

  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'mouse') return
    const index = columnAt(event)
    if (index !== null) setActive(index)
  }

  /** First tap shows the figure; tapping it again opens it, if it links. */
  function onClick(event: MouseEvent<SVGSVGElement>) {
    const index = columnAt(event)
    if (index === null) setActive(null)
    else if (index === active) open(index)
    else setActive(index)
  }

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const last = bars.length - 1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      setActive(active === null ? 0 : Math.min(last, active + 1))
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActive(active === null ? 0 : Math.max(0, active - 1))
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActive(0)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActive(last)
    } else if ((event.key === 'Enter' || event.key === ' ') && active !== null) {
      event.preventDefault()
      open(active)
    } else if (event.key === 'Escape') {
      setActive(null)
    }
  }

  function onFocus(event: FocusEvent<SVGSVGElement>) {
    if (active === null && event.currentTarget.matches(':focus-visible')) setActive(0)
  }

  const current = active === null ? null : bars[active]

  return (
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
              'aria-label': `${ariaLabel}. Use the arrow keys to step through the bars.`,
              'aria-describedby': current ? tooltipId : undefined,
              tabIndex: 0,
              onPointerMove,
              onClick,
              onKeyDown,
              onFocus,
            }
          : { role: 'img', 'aria-label': ariaLabel })}
      >
        {active !== null ? (
          <rect
            x={PAD.left + slot * active}
            y={PAD.top}
            width={slot}
            height={baseline - PAD.top}
            rx="2"
            className="fill-hull-800/6 dark:fill-chart-100/6"
          />
        ) : null}

        <Grid ticks={ticks} y={y} height={height} />

        {bars.map((bar, index) => {
          const centre = centreOf(index)
          const top = y(bar.value)
          const lit = index === active
          return (
            // Keyed by position, not label: labels repeat (two trips on one
            // day both read "06-12"), and a bar's place is its identity here.
            <g key={index}>
              <rect
                x={centre - barWidth / 2}
                y={top}
                width={barWidth}
                height={Math.max(0, baseline - top)}
                rx="1.5"
                className={lit ? 'fill-shoal-500' : 'fill-shoal-500/85'}
              />
              {bar.above ? (
                // Above the bar, in ink rather than the bar's own colour: the
                // figure is a label, and the teal is already saying "amount".
                <text
                  x={centre}
                  y={Math.max(7, top - 4)}
                  textAnchor="middle"
                  className="fill-hull-900 text-[8px] font-semibold dark:fill-chart-100"
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {bar.above}
                </text>
              ) : null}
              <text
                x={centre}
                y={baseline + 12}
                textAnchor="middle"
                className={
                  lit
                    ? 'fill-hull-900 text-[8px] font-semibold dark:fill-chart-100'
                    : 'fill-hull-800/65 text-[8px] dark:fill-chart-200/60'
                }
              >
                {bar.label}
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
          anchor={{ x: centreOf(active), y: y(current.value), fallbackY: y(current.value) }}
        >
          <TooltipHeading title={current.title} href={current.href} />
          <p className="readout pb-0.5 text-sm font-semibold">{current.valueText}</p>
        </ChartTooltip>
      ) : null}
    </div>
  )
}
