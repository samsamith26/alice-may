import { describe, expect, it } from 'vitest'
import {
  MONTH_LABEL_SPACE,
  extent,
  halfYearTicks,
  linearScale,
  monthYearLabel,
  nearestPoint,
  niceTicks,
  placeTooltip,
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

describe('monthYearLabel', () => {
  it('labels by month and year without depending on locale', () => {
    expect(monthYearLabel(2026, 6)).toBe('Jul 2026')
    expect(monthYearLabel(2027, 0)).toBe('Jan 2027')
  })
})

describe('halfYearTicks', () => {
  // Wide slots, so spacing never drops anything unless a test means it to.
  const roomy = 100

  it('labels Jan and Jul under the first trip on or after the 1st', () => {
    const dates = ['2025-01-04', '2025-03-10', '2025-07-02', '2025-08-15', '2026-01-20']
    expect(halfYearTicks(dates, roomy)).toEqual([
      { index: 0, label: 'Jan 2025' },
      { index: 2, label: 'Jul 2025' },
      { index: 4, label: 'Jan 2026' },
    ])
  })

  it('puts the label under a later month when that was the first trip', () => {
    // First trip of the year in March: "Jan 2025" still marks where it began.
    expect(halfYearTicks(['2024-11-02', '2025-03-10'], roomy)).toEqual([
      { index: 1, label: 'Jan 2025' },
    ])
  })

  it('skips a half-year with no trips rather than moving its label', () => {
    // Nothing between January and the following January: no "Jul 2025".
    const dates = ['2025-01-10', '2025-05-01', '2026-02-01']
    expect(halfYearTicks(dates, roomy)).toEqual([
      { index: 0, label: 'Jan 2025' },
      { index: 2, label: 'Jan 2026' },
    ])
  })

  it('does not label a half-year that began before the data', () => {
    // Starts mid-half-year on 15 December: no "Jul 2024" under it.
    const dates = ['2024-12-15', '2024-12-28', '2025-01-05', '2025-07-04']
    expect(halfYearTicks(dates, roomy)).toEqual([
      { index: 2, label: 'Jan 2025' },
      { index: 3, label: 'Jul 2025' },
    ])
  })

  it('labels the first trip when it falls in January or July itself', () => {
    expect(halfYearTicks(['2025-07-20', '2025-08-01'], roomy)).toEqual([
      { index: 0, label: 'Jul 2025' },
    ])
  })

  it('keeps several trips on one day in their own slots', () => {
    const dates = ['2025-06-30', '2025-07-01', '2025-07-01', '2025-07-02']
    expect(halfYearTicks(dates, roomy)).toEqual([{ index: 1, label: 'Jul 2025' }])
  })

  it('drops the later of two labels that would overlap', () => {
    // Jan and Jul one slot apart: at 30 units per slot they would collide.
    const dates = ['2025-01-05', '2025-07-05', '2025-08-01', '2025-09-01', '2026-01-03']
    expect(halfYearTicks(dates, 30)).toEqual([
      { index: 0, label: 'Jan 2025' },
      { index: 4, label: 'Jan 2026' },
    ])
  })

  it('never leaves two kept labels closer than the label space', () => {
    // Sixty-four trips over two years, as in the real log, at phone width.
    const dates = Array.from({ length: 64 }, (_, i) => {
      const day = new Date(Date.UTC(2024, 11, 15) + Math.round((i / 63) * 695) * 86_400_000)
      return day.toISOString().slice(0, 10)
    })
    const ticks = halfYearTicks(dates, PLOT / 63)
    expect(ticks.length).toBeGreaterThan(1)
    for (let i = 1; i < ticks.length; i += 1) {
      expect((ticks[i].index - ticks[i - 1].index) * (PLOT / 63)).toBeGreaterThanOrEqual(
        MONTH_LABEL_SPACE,
      )
    }
  })

  it('handles no trips', () => {
    expect(halfYearTicks([], roomy)).toEqual([])
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
