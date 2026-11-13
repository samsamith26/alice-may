/** Chart scaling maths. Pure — no DOM, no React. */

export function linearScale(
  domain: [number, number],
  range: [number, number],
): (value: number) => number {
  // A flat domain would divide by zero; treat it as unit width so a
  // single-value series renders on a line rather than as NaN.
  const span = domain[1] - domain[0] || 1
  return (value) => range[0] + ((value - domain[0]) / span) * (range[1] - range[0])
}

/** Round tick values covering [min, max], stepped at 1, 2, or 5 × a power of ten. */
export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]

  if (min === max) {
    if (min === 0) {
      // A series that is genuinely all zeroes must keep its baseline at zero.
      // Padding to [-1, 1] would put y(0) at the middle of the plot and draw a
      // half-height bar for a value of nought.
      max = 1
    } else {
      const pad = Math.abs(min) * 0.1
      min -= pad
      max += pad
    }
  }

  const rawStep = (max - min) / Math.max(1, count)
  const magnitude = 10 ** Math.floor(Math.log10(rawStep))
  const normalised = rawStep / magnitude
  const niceStep =
    (normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10) * magnitude

  const start = Math.floor(min / niceStep) * niceStep
  const end = Math.ceil(max / niceStep) * niceStep

  const ticks: number[] = []
  // Guard the loop: a degenerate step must not spin forever.
  for (let value = start; value <= end + niceStep / 2 && ticks.length < 100; value += niceStep) {
    ticks.push(Number(value.toFixed(10)))
  }

  return ticks.length >= 2 ? ticks : [start, end]
}

export function extent(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1]
  return [Math.min(...values), Math.max(...values)]
}

/* ------------------------------------------------------- half-year axis -- */

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/** "Jul 2026", independent of locale so server and client render alike. */
export function monthYearLabel(year: number, monthIndex: number): string {
  return `${MONTHS[monthIndex]} ${year}`
}

/**
 * Space each label needs, in chart units, at the 8-unit font the axis uses:
 * "Jul 2026" is about 36 wide, plus a gap. The chart scales as a whole
 * (viewBox), so this holds at every screen width.
 */
export const MONTH_LABEL_SPACE = 46

export type SlotTick = { index: number; label: string }

/** Half-years since year 0: Jan–Jun of Y is 2Y, Jul–Dec is 2Y + 1. */
function halfOf(iso: string): number {
  const year = Number(iso.slice(0, 4))
  const month = Number(iso.slice(5, 7))
  return year * 2 + (month >= 7 ? 1 : 0)
}

/**
 * Where each January and July begins on an axis of evenly spaced trips.
 *
 * `dates` are the trips' YYYY-MM-DD dates in slot order (sorted by date).
 * A half-year is labelled under the first trip on or after its 1st —
 * "Jan 2025" may sit under a trip in March if that was the first one that
 * year. A half-year with no trips gets no label; nothing is moved to a later
 * month to fill the gap.
 *
 * The first trip is the exception: a half-year that began before the log did
 * is labelled only if the first trip falls in that January or July itself.
 * Otherwise data starting on 15 December would put "Jul 2024" under it.
 *
 * Labels closer than `minSpacing` chart units to the previous kept label
 * (with `unitsPerSlot` units between neighbouring trips) are dropped, never
 * squeezed: the later one goes.
 */
export function halfYearTicks(
  dates: string[],
  unitsPerSlot: number,
  minSpacing = MONTH_LABEL_SPACE,
): SlotTick[] {
  const ticks: SlotTick[] = []
  let lastKept = -Infinity

  dates.forEach((date, index) => {
    const half = halfOf(date)
    const startsHalf =
      index === 0
        ? date.slice(5, 7) === '01' || date.slice(5, 7) === '07'
        : half > halfOf(dates[index - 1])
    if (!startsHalf) return

    if ((index - lastKept) * unitsPerSlot < minSpacing) return
    lastKept = index
    ticks.push({
      index,
      label: monthYearLabel(Math.floor(half / 2), half % 2 === 0 ? 0 : 6),
    })
  })

  return ticks
}

/**
 * The index of the point closest to `target`, or -1 when none is within
 * `radius`. Used for hit-testing: a radius much larger than the drawn dot is
 * what makes a 2-unit point tappable with a wet thumb.
 */
export function nearestPoint(
  points: Array<{ x: number; y: number }>,
  target: { x: number; y: number },
  radius: number,
): number {
  let best = -1
  let bestDistance = radius * radius
  points.forEach((point, index) => {
    const dx = point.x - target.x
    const dy = point.y - target.y
    const distance = dx * dx + dy * dy
    if (distance <= bestDistance) {
      best = index
      bestDistance = distance
    }
  })
  return best
}

export type TooltipPlacement = 'above' | 'below' | 'right' | 'left' | 'over'

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

/** A rectangle by its edges, in the same coordinates as the anchor. */
export type Bounds = { left: number; top: number; right: number; bottom: number }

/**
 * Where to put a tooltip of `box` size for a point at `anchor`, never
 * crossing `bounds`. The bounds may reach beyond the plot — the chart passes
 * its whole card, heading and legend included — which is what usually leaves
 * room above or below even on a phone.
 *
 * Preference: above the point, then below, then beside it (right, then left).
 * Only when nothing fits does it sit over the point, pinned inside the bounds.
 */
export function placeTooltip(
  /**
   * The point, or with `yEnd` a vertical run of points at one x — a trip
   * plotted on two lines — which the tooltip then clears as a whole.
   */
  anchor: { x: number; y: number; yEnd?: number },
  box: { width: number; height: number },
  bounds: Bounds,
  gap = 10,
): { left: number; top: number; placement: TooltipPlacement } {
  const high = Math.min(anchor.y, anchor.yEnd ?? anchor.y)
  const low = Math.max(anchor.y, anchor.yEnd ?? anchor.y)
  const centredLeft = clamp(anchor.x - box.width / 2, bounds.left, bounds.right - box.width)
  const sideTop = clamp(
    (high + low) / 2 - box.height / 2,
    bounds.top,
    bounds.bottom - box.height,
  )

  if (high - gap - box.height >= bounds.top) {
    return { left: centredLeft, top: high - gap - box.height, placement: 'above' }
  }
  if (low + gap + box.height <= bounds.bottom) {
    return { left: centredLeft, top: low + gap, placement: 'below' }
  }
  if (anchor.x + gap + box.width <= bounds.right) {
    return { left: anchor.x + gap, top: sideTop, placement: 'right' }
  }
  if (anchor.x - gap - box.width >= bounds.left) {
    return { left: anchor.x - gap - box.width, top: sideTop, placement: 'left' }
  }
  return { left: centredLeft, top: sideTop, placement: 'over' }
}
