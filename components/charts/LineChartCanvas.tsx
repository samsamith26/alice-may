'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
} from 'react'
import { Grid, PAD, WIDTH } from './frame'
import {
  dodgeOffsets,
  extent,
  linearScale,
  nearestPoint,
  niceTicks,
  placeTooltip,
  timeDomain,
  timeTicks,
} from './scale'
import type { Series, TripPointMeta } from './types'
import { formatDistance, formatGallons, formatHours } from '@/lib/format/units'

/** Keeps the first and last points off the axis lines. */
const INSET = 6
/** How far apart two same-day trips are fanned, in chart units. */
const DODGE_GAP = 5
/**
 * Hit radii in chart units — on a phone, one unit is about one CSS pixel, so a
 * tap lands on a point anywhere inside a ~44px circle around a 4px dot.
 */
const TAP_RADIUS = 22
const HOVER_RADIUS = 16

const TONE = {
  primary: { stroke: 'stroke-magenta-500', fill: 'fill-magenta-500' },
  secondary: { stroke: 'stroke-shoal-500', fill: 'fill-shoal-500' },
} as const

type Plotted = {
  key: string
  tone: keyof typeof TONE
  px: number
  py: number
  meta?: TripPointMeta
}

function tripDate(iso: string): string {
  // Noon UTC, formatted in UTC: a calendar date, immune to the viewer's zone.
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function rate(value: number | null): string {
  return value === null ? '—' : value.toFixed(2)
}

export function LineChartCanvas({
  series,
  height,
  ariaLabel,
}: {
  series: Series[]
  height: number
  ariaLabel: string
}) {
  const router = useRouter()
  const tooltipId = useId()
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)

  const layout = useMemo(() => {
    const all = series.flatMap((s) => s.points)
    const [xMin, xMax] = timeDomain(all.map((p) => p.x))
    const [yMin, yMax] = extent(all.map((p) => p.y))
    const yTicks = niceTicks(Math.min(0, yMin), yMax, 4)

    const left = PAD.left + INSET
    const right = WIDTH - PAD.right - INSET
    const x = linearScale([xMin, xMax], [left, right])
    const y = linearScale([yTicks[0], yTicks[yTicks.length - 1]], [height - PAD.bottom, PAD.top])

    const lines = series.map((s, si) => {
      const sorted = [...s.points].sort((a, b) => a.x - b.x)
      const offsets = dodgeOffsets(
        sorted.map((p) => p.x),
        DODGE_GAP,
      )
      const tone = s.tone ?? 'primary'
      const points: Plotted[] = sorted.map((p, i) => ({
        key: `${si}:${i}`,
        tone,
        px: x(p.x) + offsets[i],
        py: y(p.y),
        meta: p.meta,
      }))
      return { label: s.label, tone, points }
    })

    // Keyboard order: left to right across the chart, whichever line.
    const flat = lines.flatMap((line) => line.points).sort((a, b) => a.px - b.px || a.py - b.py)

    return {
      yTicks,
      y,
      x,
      xTicks: timeTicks(xMin, xMax, right - left),
      lines,
      flat,
    }
  }, [series, height])

  const active = layout.flat.find((p) => p.key === activeKey) ?? null
  const activeTrip = active?.meta?.tripId ?? null

  // ---------------------------------------------------------- positioning --

  // Placed imperatively, after layout, because where the tooltip can go
  // depends on its rendered size and the chart's on-screen size.
  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const svg = svgRef.current
    const tip = tipRef.current
    if (!wrap || !svg || !tip || !active) return

    function place() {
      if (!wrap || !svg || !tip || !active) return
      const own = wrap.getBoundingClientRect()
      const box = svg.getBoundingClientRect()
      const toWrapY = (py: number) => box.top - own.top + (py / height) * box.height
      // The same trip's point on the other line is lit too; keep clear of both.
      const siblings = layout.flat
        .filter((p) => p.meta && p.meta.tripId === active.meta?.tripId)
        .map((p) => p.py)
      const anchor = {
        x: box.left - own.left + (active.px / WIDTH) * box.width,
        y: toWrapY(Math.min(active.py, ...siblings)),
        yEnd: toWrapY(Math.max(active.py, ...siblings)),
      }
      // The whole card is fair game, not just the plot: on a phone the plot
      // alone is barely taller than the tooltip, but the heading above and
      // the legend below leave room for it beside the point it describes.
      const card = (wrap.closest('section') ?? wrap).getBoundingClientRect()
      const MARGIN = 6
      const size = { width: tip.offsetWidth, height: tip.offsetHeight }
      const bounds = {
        left: card.left - own.left + MARGIN,
        top: card.top - own.top + MARGIN,
        right: card.right - own.left - MARGIN,
        bottom: card.bottom - own.top - MARGIN,
      }
      let spot = placeTooltip(anchor, size, bounds)
      // Nowhere clears both lines: settle for clearing the point in hand.
      if (spot.placement === 'over') {
        spot = placeTooltip({ x: anchor.x, y: toWrapY(active.py) }, size, bounds)
      }
      tip.style.left = `${spot.left}px`
      tip.style.top = `${spot.top}px`
      tip.style.visibility = 'visible'
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [active, height, layout])

  // Tapping anywhere outside the chart and its tooltip dismisses it.
  useEffect(() => {
    if (activeKey === null) return
    function onDown(event: globalThis.PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setActiveKey(null)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [activeKey])

  // ------------------------------------------------------------- pointer --

  function toChart(event: { clientX: number; clientY: number }) {
    const svg = svgRef.current
    const matrix = svg?.getScreenCTM()
    if (!svg || !matrix) return null
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    return { x: point.x, y: point.y }
  }

  function hit(event: { clientX: number; clientY: number }, radius: number): Plotted | null {
    const target = toChart(event)
    if (!target) return null
    const index = nearestPoint(
      layout.flat.map((p) => ({ x: p.px, y: p.py })),
      target,
      radius,
    )
    return index === -1 ? null : layout.flat[index]
  }

  function open(point: Plotted) {
    if (point.meta) router.push(`/trips/${point.meta.tripId}`)
  }

  // Mouse only: a touch has no hover, and its synthetic moves would fight
  // the tap handling below.
  function onPointerMove(event: PointerEvent<SVGSVGElement>) {
    if (event.pointerType !== 'mouse') return
    const near = hit(event, HOVER_RADIUS)
    // Sticky: drifting off a point (towards the tooltip, say) keeps it.
    if (near) setActiveKey(near.key)
  }

  /**
   * First tap shows the trip; tapping it again opens it. With a mouse the
   * hover has already shown it, so a click goes straight through.
   */
  function onClick(event: MouseEvent<SVGSVGElement>) {
    const near = hit(event, TAP_RADIUS)
    if (!near) {
      setActiveKey(null)
      return
    }
    const sameTrip = activeTrip !== null && near.meta?.tripId === activeTrip
    if (near.key === activeKey || sameTrip) open(near)
    else setActiveKey(near.key)
  }

  // ------------------------------------------------------------ keyboard --

  function onKeyDown(event: KeyboardEvent<SVGSVGElement>) {
    const { flat } = layout
    if (flat.length === 0) return
    const index = flat.findIndex((p) => p.key === activeKey)

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveKey(flat[Math.min(flat.length - 1, index + 1)].key)
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveKey(flat[Math.max(0, index === -1 ? 0 : index - 1)].key)
    } else if (event.key === 'Home') {
      event.preventDefault()
      setActiveKey(flat[0].key)
    } else if (event.key === 'End') {
      event.preventDefault()
      setActiveKey(flat[flat.length - 1].key)
    } else if ((event.key === 'Enter' || event.key === ' ') && active) {
      event.preventDefault()
      open(active)
    } else if (event.key === 'Escape') {
      setActiveKey(null)
    }
  }

  // Tabbing in shows the first trip; a mouse click focusing the chart does not.
  function onFocus(event: FocusEvent<SVGSVGElement>) {
    if (activeKey === null && event.currentTarget.matches(':focus-visible')) {
      setActiveKey(layout.flat[0]?.key ?? null)
    }
  }

  // -------------------------------------------------------------- render --

  const meta = active?.meta

  return (
    <div
      ref={wrapRef}
      className="relative"
      onPointerLeave={(event) => {
        if (event.pointerType === 'mouse') setActiveKey(null)
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${WIDTH} ${height}`}
        className="w-full touch-manipulation rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta-500"
        style={{ cursor: active ? 'pointer' : 'default' }}
        role="group"
        aria-roledescription="chart"
        aria-label={`${ariaLabel}. Use the arrow keys to step through trips, Enter to open one.`}
        aria-describedby={meta ? tooltipId : undefined}
        tabIndex={0}
        onPointerMove={onPointerMove}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
      >
        <Grid ticks={layout.yTicks} y={layout.y} height={height} />

        {layout.xTicks.map((tick) => {
          const tx = layout.x(tick.value)
          const half = tick.label.length * 2.3
          return (
            <g key={tick.value}>
              <line
                x1={tx}
                x2={tx}
                y1={height - PAD.bottom}
                y2={height - PAD.bottom + 3}
                className="stroke-hull-800/30 dark:stroke-chart-200/30"
                strokeWidth="0.8"
              />
              <text
                x={Math.min(Math.max(tx, half), WIDTH - half)}
                y={height - PAD.bottom + 12}
                textAnchor="middle"
                className="fill-hull-800/65 text-[8px] dark:fill-chart-200/60"
              >
                {tick.label}
              </text>
            </g>
          )
        })}

        {active ? (
          <line
            x1={active.px}
            x2={active.px}
            y1={PAD.top}
            y2={height - PAD.bottom}
            className="stroke-hull-800/30 dark:stroke-chart-200/35"
            strokeWidth="0.8"
            strokeDasharray="2 2"
          />
        ) : null}

        {layout.lines.map((line) => (
          <g key={line.label}>
            {line.points.length >= 2 ? (
              <path
                d={line.points
                  .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px.toFixed(2)} ${p.py.toFixed(2)}`)
                  .join(' ')}
                fill="none"
                className={TONE[line.tone].stroke}
                strokeWidth="1.8"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
            {line.points.map((p) => {
              const lit =
                p.key === activeKey || (activeTrip !== null && p.meta?.tripId === activeTrip)
              return (
                <circle
                  key={p.key}
                  cx={p.px}
                  cy={p.py}
                  r={lit ? 4.5 : 2.2}
                  strokeWidth={lit ? 1.6 : 0}
                  className={`${TONE[p.tone].fill} stroke-white dark:stroke-hull-900`}
                />
              )
            })}
          </g>
        ))}
      </svg>

      {meta ? (
        <div
          ref={tipRef}
          id={tooltipId}
          role="tooltip"
          aria-live="polite"
          // Hidden until placed, so it never flashes at the corner.
          style={{ left: 0, top: 0, visibility: 'hidden' }}
          className="absolute z-10 w-52 max-w-full rounded-lg border border-chart-300/80 bg-white/95 px-3 pb-2.5 pt-1 text-xs text-hull-950 shadow-lg backdrop-blur-sm dark:border-hull-700/70 dark:bg-hull-900/95 dark:text-chart-100"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold">{tripDate(meta.date)}</p>
            {/* In the header row to keep the tooltip short; min-h keeps the
                tap target generous. */}
            <Link
              href={`/trips/${meta.tripId}`}
              className="-mr-1 inline-flex min-h-9 shrink-0 items-center px-1 font-semibold text-magenta-600 hover:underline dark:text-magenta-400"
            >
              View trip →
            </Link>
          </div>

          <p className="readout">
            <span className="text-sm font-semibold">{formatDistance(meta.distanceMi)}</span>
            <span className="ml-0.5 opacity-70">mi</span>
            {meta.distanceNm !== null ? (
              <span className="ml-1.5 text-[0.9em] opacity-55">
                {formatDistance(meta.distanceNm)} nm
              </span>
            ) : null}
          </p>

          <dl className="readout mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="flex items-baseline justify-between gap-1">
              <dt className="annotation text-[0.65rem] opacity-60">Hours</dt>
              <dd>{formatHours(meta.hours)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-1">
              <dt className="annotation text-[0.65rem] opacity-60">Fuel</dt>
              <dd>
                {formatGallons(meta.fuelGal)}
                {meta.fuelGal !== null ? <span className="opacity-60"> gal</span> : null}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-1">
              <dt className="annotation text-[0.65rem] text-magenta-600 dark:text-magenta-400">
                mi/gal
              </dt>
              <dd>{rate(meta.miPerGal)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-1">
              <dt className="annotation text-[0.65rem] text-shoal-700 dark:text-shoal-300">
                gal/hr
              </dt>
              <dd>{rate(meta.galPerHour)}</dd>
            </div>
          </dl>

          {meta.notes ? <p className="mt-1.5 line-clamp-2 opacity-75">{meta.notes}</p> : null}
        </div>
      ) : null}
    </div>
  )
}
