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

/* ------------------------------------------------------------ time axis -- */

const DAY_MS = 86_400_000
const SHORTEST_MONTH_MS = 28 * DAY_MS

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const

/**
 * A trip date (YYYY-MM-DD) as UTC midnight milliseconds. Dates are calendar
 * days, not instants, so everything on the time axis stays in UTC; a local
 * timezone would shift a date across midnight and onto the wrong day.
 */
export function isoDateToUtcMs(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/** "Jul 2026", independent of locale so server and client render alike. */
export function monthYearLabel(ms: number): string {
  const date = new Date(ms)
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`
}

/**
 * The x domain for a set of dates. A span under two weeks is widened to two
 * weeks around its middle, so one weekend's trips do not get stretched edge to
 * edge as though they were a season.
 */
export function timeDomain(values: number[], minSpanMs = 14 * DAY_MS): [number, number] {
  if (values.length === 0) return [0, minSpanMs]
  const [min, max] = extent(values)
  if (max - min >= minSpanMs) return [min, max]
  const mid = (min + max) / 2
  return [mid - minSpanMs / 2, mid + minSpanMs / 2]
}

export type TimeTick = { value: number; label: string }

/** Steps tried in order, in months. Twelve and up are labelled by year alone. */
const MONTH_STEPS = [1, 2, 3, 6, 12, 24, 60, 120] as const

/**
 * Space each label needs, in chart units, at the 8-unit font the axis uses:
 * "Jul 2026" is about 36 wide, "2026" about 19, plus a gap either side.
 * Because the chart scales as a whole (viewBox), these hold at every screen
 * width — a phone gets fewer pixels but the labels shrink with them.
 */
export const MONTH_LABEL_SPACE = 46
export const YEAR_LABEL_SPACE = 30

/**
 * Month-start ticks across [min, max] that will not overlap at `plotWidth`
 * chart units. Months are skipped in even steps aligned to the calendar
 * (every 3 months lands on Jan/Apr/Jul/Oct), and once even 6-monthly labels
 * would collide, it switches to years.
 *
 * Never returns nothing: a span that contains no month boundary (trips all
 * within one month) gets a single label for that month at its middle.
 */
export function timeTicks(min: number, max: number, plotWidth: number): TimeTick[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max < min) return []

  const span = Math.max(max - min, 1)
  // Sized on the shortest month, not the average, so a step that clears on
  // paper does not collide across February.
  const unitsPerMonth = (plotWidth / span) * SHORTEST_MONTH_MS

  const step =
    MONTH_STEPS.find(
      (months) =>
        months * unitsPerMonth >= (months >= 12 ? YEAR_LABEL_SPACE : MONTH_LABEL_SPACE),
    ) ?? MONTH_STEPS[MONTH_STEPS.length - 1]

  const byYear = step >= 12
  const start = new Date(min)
  // Months since year 0, so alignment to the step is a plain modulus.
  let index = start.getUTCFullYear() * 12 + start.getUTCMonth()
  if (Date.UTC(Math.floor(index / 12), index % 12, 1) < min) index += 1
  index = Math.ceil(index / step) * step

  const ticks: TimeTick[] = []
  for (; ticks.length < 200; index += step) {
    const value = Date.UTC(Math.floor(index / 12), index % 12, 1)
    if (value > max) break
    ticks.push({
      value,
      label: byYear ? String(Math.floor(index / 12)) : monthYearLabel(value),
    })
  }

  if (ticks.length === 0) {
    const mid = min + (max - min) / 2
    return [{ value: mid, label: monthYearLabel(mid) }]
  }
  return ticks
}

/**
 * Sideways offsets that fan out points sharing an x value — two trips on one
 * day — so neither hides the other. Points with a unique x get 0. Offsets are
 * centred on the true position, in the order the points arrive.
 */
export function dodgeOffsets(xs: number[], gap: number): number[] {
  const groups = new Map<number, number[]>()
  xs.forEach((x, i) => {
    const group = groups.get(x)
    if (group) group.push(i)
    else groups.set(x, [i])
  })

  const offsets = new Array<number>(xs.length).fill(0)
  for (const members of groups.values()) {
    if (members.length < 2) continue
    members.forEach((pointIndex, rank) => {
      offsets[pointIndex] = (rank - (members.length - 1) / 2) * gap
    })
  }
  return offsets
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
