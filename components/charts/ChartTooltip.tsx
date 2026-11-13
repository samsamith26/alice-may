'use client'

import Link from 'next/link'
import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react'
import { WIDTH } from './frame'
import { placeTooltip } from './scale'

/**
 * Where a tooltip points, in the chart's own viewBox units. `yEnd` widens the
 * anchor to a vertical run the tooltip should clear as a whole (a trip on two
 * lines, a bar's full height); `fallbackY` is what it settles for clearing
 * when nothing clears the whole run.
 */
export type TooltipAnchor = { x: number; y: number; yEnd?: number; fallbackY?: number }

/**
 * The tooltip every interactive chart shares: card-styled, placed after
 * layout so it can use its real size, kept inside the enclosing card's edges,
 * and re-placed on resize.
 *
 * Positioned imperatively rather than through state, so placing it costs no
 * extra render and never flashes at the corner first.
 */
export function ChartTooltip({
  id,
  wrapRef,
  svgRef,
  viewHeight,
  anchor,
  placementKey,
  children,
}: {
  id: string
  wrapRef: RefObject<HTMLDivElement | null>
  svgRef: RefObject<SVGSVGElement | null>
  viewHeight: number
  anchor: TooltipAnchor
  /** Changes whenever the content does, so a resized tooltip is re-placed. */
  placementKey: string | number
  children: ReactNode
}) {
  const tipRef = useRef<HTMLDivElement>(null)
  const { x, y, yEnd, fallbackY } = anchor

  useLayoutEffect(() => {
    const wrap = wrapRef.current
    const svg = svgRef.current
    const tip = tipRef.current
    if (!wrap || !svg || !tip) return

    function place() {
      if (!wrap || !svg || !tip) return
      const own = wrap.getBoundingClientRect()
      const box = svg.getBoundingClientRect()
      const toWrapX = (vx: number) => box.left - own.left + (vx / WIDTH) * box.width
      const toWrapY = (vy: number) => box.top - own.top + (vy / viewHeight) * box.height

      // The whole card is fair game, not just the plot: on a phone the plot
      // alone is barely taller than the tooltip, but the heading above and
      // anything below leave room for it beside what it describes.
      const card = (wrap.closest('section') ?? wrap).getBoundingClientRect()
      const MARGIN = 6
      const bounds = {
        left: card.left - own.left + MARGIN,
        top: card.top - own.top + MARGIN,
        right: card.right - own.left - MARGIN,
        bottom: card.bottom - own.top - MARGIN,
      }
      const size = { width: tip.offsetWidth, height: tip.offsetHeight }

      let spot = placeTooltip(
        { x: toWrapX(x), y: toWrapY(y), yEnd: yEnd === undefined ? undefined : toWrapY(yEnd) },
        size,
        bounds,
      )
      if (spot.placement === 'over' && fallbackY !== undefined) {
        spot = placeTooltip({ x: toWrapX(x), y: toWrapY(fallbackY) }, size, bounds)
      }
      tip.style.left = `${spot.left}px`
      tip.style.top = `${spot.top}px`
      tip.style.visibility = 'visible'
    }

    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [wrapRef, svgRef, viewHeight, x, y, yEnd, fallbackY, placementKey])

  return (
    <div
      ref={tipRef}
      id={id}
      role="tooltip"
      aria-live="polite"
      // Hidden until placed, so it never flashes at the corner.
      style={{ left: 0, top: 0, visibility: 'hidden' }}
      className="absolute z-10 w-52 max-w-full rounded-lg border border-chart-300/80 bg-white/95 px-3 pb-2.5 pt-1 text-xs text-hull-950 shadow-lg backdrop-blur-sm dark:border-hull-700/70 dark:bg-hull-900/95 dark:text-chart-100"
    >
      {children}
    </div>
  )
}

/** The tooltip's first line: what it is about, and a way through to it. */
export function TooltipHeading({ title, href }: { title: string; href?: string }) {
  return (
    <div className="flex min-h-9 items-center justify-between gap-2">
      <p className="font-semibold">{title}</p>
      {href ? (
        // min-h keeps the tap target generous without a taller tooltip.
        <Link
          href={href}
          className="-mr-1 inline-flex min-h-9 shrink-0 items-center px-1 font-semibold text-magenta-600 hover:underline dark:text-magenta-400"
        >
          View trip →
        </Link>
      ) : null}
    </div>
  )
}

/** Dismisses when anything outside the chart (and its tooltip) is touched. */
export function useDismissOnOutsideTap(
  wrapRef: RefObject<HTMLDivElement | null>,
  active: boolean,
  dismiss: () => void,
) {
  useEffect(() => {
    if (!active) return
    function onDown(event: PointerEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) dismiss()
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [wrapRef, active, dismiss])
}

/** A screen point in the SVG's own viewBox units. */
export function toViewBox(
  svg: SVGSVGElement | null,
  event: { clientX: number; clientY: number },
): { x: number; y: number } | null {
  const matrix = svg?.getScreenCTM()
  if (!svg || !matrix) return null
  const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
  return { x: point.x, y: point.y }
}

/** Shared focus ring and touch behaviour for every interactive chart SVG. */
export const INTERACTIVE_SVG =
  'w-full touch-manipulation rounded-md outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-magenta-500'
