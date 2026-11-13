import { describe, expect, it } from 'vitest'
import {
  MONTH_LABEL_SPACE,
  YEAR_LABEL_SPACE,
  dodgeOffsets,
  extent,
  isoDateToUtcMs,
  linearScale,
  monthYearLabel,
  nearestPoint,
  niceTicks,
  placeTooltip,
  timeDomain,
  timeTicks,
} from './scale'

describe('linearScale', () => {
  it('maps the domain onto the range', () => {
    const scale = linearScale([0, 10], [0, 100])
    expect(scale(0)).toBe(0)
    expect(scale(5)).toBe(50)
    expect(scale(10)).toBe(100)
  })

  it('inverts for SVG y-axes, where the range runs downward', () => {
    const scale = linearScale([0, 10], [200, 0])
    expect(scale(0)).toBe(200)
    expect(scale(10)).toBe(0)
  })

  it('does not divide by zero on a flat domain', () => {
    const scale = linearScale([5, 5], [0, 100])
    expect(Number.isFinite(scale(5))).toBe(true)
  })
})

describe('niceTicks', () => {
  it('produces round numbers covering the range', () => {
    const ticks = niceTicks(0, 97, 5)
    expect(ticks[0]).toBeLessThanOrEqual(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(97)
    expect(ticks.every(Number.isFinite)).toBe(true)
  })

  it('handles a zero-width range without looping forever', () => {
    const ticks = niceTicks(4, 4, 5)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.length).toBeLessThan(100)
  })

  it('keeps the baseline at zero when every value is zero', () => {
    // Otherwise y(0) lands mid-plot and a bar of nought renders half height,
    // implying spend or hours that never happened.
    const ticks = niceTicks(0, 0, 4)
    expect(ticks[0]).toBe(0)
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0)
  })

  it('survives non-finite input', () => {
    expect(niceTicks(Number.NaN, 10, 5)).toEqual([0, 1])
  })

  it('handles fractional ranges like nm per gallon', () => {
    const ticks = niceTicks(1.2, 2.8, 4)
    expect(ticks[0]).toBeLessThanOrEqual(1.2)
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(2.8)
  })
})

describe('extent', () => {
  it('returns min and max', () => {
    expect(extent([3, 1, 4, 1, 5])).toEqual([1, 5])
  })

  it('has a usable default when there is no data', () => {
    expect(extent([])).toEqual([0, 1])
  })
})

/** The fuel chart's plot width: 320 less both paddings and the edge inset. */
const PLOT = 266
const d = isoDateToUtcMs

describe('isoDateToUtcMs and monthYearLabel', () => {
  it('reads a calendar date as UTC midnight', () => {
    expect(d('2026-07-04')).toBe(Date.UTC(2026, 6, 4))
  })

  it('labels by month and year without depending on locale', () => {
    expect(monthYearLabel(d('2026-07-31'))).toBe('Jul 2026')
    expect(monthYearLabel(d('2027-01-01'))).toBe('Jan 2027')
  })
})

describe('timeDomain', () => {
  it('keeps a long span as it is', () => {
    expect(timeDomain([d('2026-01-01'), d('2026-06-01')])).toEqual([
      d('2026-01-01'),
      d('2026-06-01'),
    ])
  })

  it('widens a short span to two weeks around its middle', () => {
    const [min, max] = timeDomain([d('2026-07-04'), d('2026-07-04')])
    expect(max - min).toBe(14 * 86_400_000)
    expect((min + max) / 2).toBe(d('2026-07-04'))
  })
})

describe('timeTicks', () => {
  const labels = (from: string, to: string) =>
    timeTicks(d(from), d(to), PLOT).map((t) => t.label)

  it('labels every month over a short season', () => {
    expect(labels('2026-07-01', '2026-10-31')).toEqual([
      'Jul 2026',
      'Aug 2026',
      'Sep 2026',
      'Oct 2026',
    ])
  })

  it('skips months over a year, on calendar-aligned steps', () => {
    // Monthly and two-monthly would collide at this width; quarterly lands on
    // the calendar quarters, not on whichever month the data starts in.
    expect(labels('2026-01-10', '2026-12-20')).toEqual(['Apr 2026', 'Jul 2026', 'Oct 2026'])
  })

  it('shows only years once the span is long', () => {
    expect(labels('2024-03-01', '2026-11-01')).toEqual(['2025', '2026'])
  })

  it('steps whole years apart over decades', () => {
    const ticks = labels('1996-01-01', '2026-01-01').map(Number)
    expect(ticks.length).toBeGreaterThan(1)
    expect(ticks.every((year) => Number.isInteger(year))).toBe(true)
  })

  it('still labels a span with no month boundary in it', () => {
    expect(labels('2026-07-05', '2026-07-20')).toEqual(['Jul 2026'])
  })

  it('never puts labels closer than they need, across many spans', () => {
    const start = d('2025-02-01')
    for (let days = 10; days < 4000; days += 37) {
      const end = start + days * 86_400_000
      const ticks = timeTicks(start, end, PLOT)
      const unitsPerMs = PLOT / (end - start)
      for (let i = 1; i < ticks.length; i += 1) {
        const gap = (ticks[i].value - ticks[i - 1].value) * unitsPerMs
        const needed = /^\d{4}$/.test(ticks[i].label) ? YEAR_LABEL_SPACE : MONTH_LABEL_SPACE
        expect(gap).toBeGreaterThanOrEqual(needed)
      }
    }
  })

  it('returns nothing for an unusable range', () => {
    expect(timeTicks(Number.NaN, 5, PLOT)).toEqual([])
    expect(timeTicks(10, 5, PLOT)).toEqual([])
  })
})

describe('dodgeOffsets', () => {
  it('leaves points on their own day alone', () => {
    expect(dodgeOffsets([1, 2, 3], 5)).toEqual([0, 0, 0])
  })

  it('fans out same-day points around their true position', () => {
    expect(dodgeOffsets([1, 2, 2, 3], 6)).toEqual([0, -3, 3, 0])
    expect(dodgeOffsets([4, 4, 4], 5)).toEqual([-5, 0, 5])
  })
})

describe('nearestPoint', () => {
  const points = [
    { x: 10, y: 10 },
    { x: 50, y: 10 },
    { x: 52, y: 40 },
  ]

  it('finds the closest point within the radius', () => {
    expect(nearestPoint(points, { x: 48, y: 14 }, 20)).toBe(1)
    expect(nearestPoint(points, { x: 53, y: 35 }, 20)).toBe(2)
  })

  it('finds nothing when every point is too far', () => {
    expect(nearestPoint(points, { x: 200, y: 200 }, 20)).toBe(-1)
    expect(nearestPoint([], { x: 0, y: 0 }, 20)).toBe(-1)
  })
})

describe('placeTooltip', () => {
  const box = { width: 100, height: 60 }
  const bounds = { left: 0, top: 0, right: 300, bottom: 200 }

  it('uses room beyond the plot when the bounds extend past it', () => {
    // The card's heading sits above the plot: negative top in plot coords.
    const card = { left: -16, top: -80, right: 316, bottom: 230 }
    const tall = { width: 220, height: 150 }
    const placed = placeTooltip({ x: 150, y: 100 }, tall, card)
    expect(placed.placement).toBe('above')
    expect(placed.top).toBe(-60)
    expect(placed.left).toBe(40)
  })

  it('sits above a low point, centred on it', () => {
    expect(placeTooltip({ x: 150, y: 150 }, box, bounds)).toEqual({
      left: 100,
      top: 80,
      placement: 'above',
    })
  })

  it('drops below a point near the top', () => {
    expect(placeTooltip({ x: 150, y: 20 }, box, bounds).placement).toBe('below')
  })

  it('slides inward rather than crossing a side edge', () => {
    expect(placeTooltip({ x: 5, y: 150 }, box, bounds).left).toBe(0)
    expect(placeTooltip({ x: 295, y: 150 }, box, bounds).left).toBe(200)
  })

  it('goes beside the point when neither above nor below fits', () => {
    const tall = { width: 100, height: 150 }
    const right = placeTooltip({ x: 40, y: 100 }, tall, bounds)
    expect(right.placement).toBe('right')
    expect(right.left).toBe(50)
    expect(right.top).toBe(25)
    expect(placeTooltip({ x: 260, y: 100 }, tall, bounds).placement).toBe('left')
  })

  it('clears every point of a trip plotted on two lines', () => {
    // Points at y 150 and 90: above must clear 90, below must clear 150.
    const above = placeTooltip({ x: 150, y: 150, yEnd: 90 }, box, bounds)
    expect(above).toEqual({ left: 100, top: 20, placement: 'above' })
    const below = placeTooltip({ x: 150, y: 50, yEnd: 20 }, box, bounds)
    expect(below.placement).toBe('below')
    expect(below.top).toBe(60)
  })

  it('stays inside the bounds when nothing fits', () => {
    const huge = { width: 280, height: 190 }
    const placed = placeTooltip({ x: 150, y: 100 }, huge, bounds)
    expect(placed.placement).toBe('over')
    expect(placed.left).toBeGreaterThanOrEqual(0)
    expect(placed.left + huge.width).toBeLessThanOrEqual(bounds.right)
    expect(placed.top + huge.height).toBeLessThanOrEqual(bounds.bottom)
  })
})
