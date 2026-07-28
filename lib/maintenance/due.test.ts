import { describe, expect, it } from 'vitest'
import { addInterval, computeDueStatus } from './due'

const today = new Date('2026-07-26T12:00:00Z')

const oilSchedule = {
  service_type: 'Engine oil & filter',
  interval_hours: 100,
  interval_count: 12,
  interval_unit: 'month' as const,
  active: true,
}

describe('computeDueStatus', () => {
  it('flags a service never performed as overdue', () => {
    // An unserviced 2009 engine is not "ok" just because there is no record.
    const [item] = computeDueStatus([oilSchedule], [], 412, today)
    expect(item.status).toBe('overdue')
    expect(item.lastServiceDate).toBeNull()
  })

  it('reports ok when well inside both intervals', () => {
    const [item] = computeDueStatus(
      [oilSchedule],
      [
        {
          service_type: 'Engine oil & filter',
          service_date: '2026-06-01',
          engine_hours_at_service: 400,
        },
      ],
      420,
      today,
    )
    expect(item.status).toBe('ok')
    expect(item.dueAtHours).toBe(500)
    expect(item.hoursRemaining).toBe(80)
  })

  it('warns when within 10 percent of the hour interval', () => {
    const [item] = computeDueStatus(
      [oilSchedule],
      [
        {
          service_type: 'Engine oil & filter',
          service_date: '2026-06-01',
          engine_hours_at_service: 400,
        },
      ],
      495,
      today,
    )
    expect(item.status).toBe('soon')
  })

  it('goes overdue on hours even when the calendar interval is fine', () => {
    const [item] = computeDueStatus(
      [oilSchedule],
      [
        {
          service_type: 'Engine oil & filter',
          service_date: '2026-07-01',
          engine_hours_at_service: 400,
        },
      ],
      505,
      today,
    )
    expect(item.status).toBe('overdue')
  })

  it('goes overdue on the calendar even when hours are fine', () => {
    const [item] = computeDueStatus(
      [
        {
          service_type: 'Water pump impeller',
          interval_hours: null,
          interval_count: 12,
          interval_unit: 'month' as const,
          active: true,
        },
      ],
      [
        {
          service_type: 'Water pump impeller',
          service_date: '2025-01-01',
          engine_hours_at_service: 300,
        },
      ],
      310,
      today,
    )
    expect(item.status).toBe('overdue')
    expect(item.dueOnDate).toBe('2026-01-01')
  })

  it('uses the most recent service when several are logged out of order', () => {
    const [item] = computeDueStatus(
      [{ ...oilSchedule, interval_count: null, interval_unit: null }],
      [
        {
          service_type: 'Engine oil & filter',
          service_date: '2026-06-01',
          engine_hours_at_service: 400,
        },
        {
          service_type: 'Engine oil & filter',
          service_date: '2025-01-01',
          engine_hours_at_service: 200,
        },
      ],
      420,
      today,
    )
    expect(item.lastServiceHours).toBe(400)
    expect(item.status).toBe('ok')
  })

  it('skips inactive schedules', () => {
    expect(
      computeDueStatus(
        [
          {
            service_type: 'Spark plugs',
            interval_hours: 400,
            interval_count: null,
            interval_unit: null,
            active: false,
          },
        ],
        [],
        900,
        today,
      ),
    ).toHaveLength(0)
  })

  it('ignores log entries for a different service', () => {
    const [item] = computeDueStatus(
      [oilSchedule],
      [
        {
          service_type: 'Anodes / zincs',
          service_date: '2026-07-01',
          engine_hours_at_service: 410,
        },
      ],
      420,
      today,
    )
    expect(item.lastServiceDate).toBeNull()
    expect(item.status).toBe('overdue')
  })

  it('sorts worst first so the dashboard leads with what matters', () => {
    const items = computeDueStatus(
      [
        {
          service_type: 'Fine',
          interval_hours: 100,
          interval_count: null,
          interval_unit: null,
          active: true,
        },
        {
          service_type: 'Late',
          interval_hours: 100,
          interval_count: null,
          interval_unit: null,
          active: true,
        },
      ],
      [
        { service_type: 'Fine', service_date: '2026-07-01', engine_hours_at_service: 400 },
        { service_type: 'Late', service_date: '2026-01-01', engine_hours_at_service: 100 },
      ],
      420,
      today,
    )
    expect(items[0].serviceType).toBe('Late')
    expect(items[0].status).toBe('overdue')
  })

  it('cannot judge hours when the engine reading is unknown', () => {
    const [item] = computeDueStatus(
      [{ ...oilSchedule, interval_count: null, interval_unit: null }],
      [
        {
          service_type: 'Engine oil & filter',
          service_date: '2026-06-01',
          engine_hours_at_service: 400,
        },
      ],
      null,
      today,
    )
    expect(item.hoursRemaining).toBeNull()
    expect(item.status).toBe('ok')
  })

  it('defaults an unlabelled schedule to mechanical', () => {
    const [item] = computeDueStatus([oilSchedule], [], 412, today)
    expect(item.category).toBe('mechanical')
  })
})

/* ------------------------------------------------------- interval units -- */

describe('addInterval', () => {
  it('adds days', () => {
    expect(addInterval('2026-07-26', 10, 'day')).toBe('2026-08-05')
  })

  it('adds weeks', () => {
    expect(addInterval('2026-07-26', 2, 'week')).toBe('2026-08-09')
  })

  it('adds months', () => {
    expect(addInterval('2026-07-26', 3, 'month')).toBe('2026-10-26')
  })

  it('adds years', () => {
    expect(addInterval('2026-07-26', 3, 'year')).toBe('2029-07-26')
  })

  it('clamps rather than overflowing a short month', () => {
    // Plain month arithmetic turns this into 3 March, moving a service into a
    // month it does not belong in.
    expect(addInterval('2026-01-31', 1, 'month')).toBe('2026-02-28')
    expect(addInterval('2028-01-31', 1, 'month')).toBe('2028-02-29')
  })

  it('crosses a year boundary', () => {
    expect(addInterval('2026-11-15', 4, 'month')).toBe('2027-03-15')
  })
})

describe('computeDueStatus, interval units', () => {
  function scheduleEvery(count: number, unit: 'day' | 'week' | 'month' | 'year') {
    return {
      service_type: 'Rent',
      category: 'bill' as const,
      interval_hours: null,
      interval_count: count,
      interval_unit: unit,
      active: true,
    }
  }

  const paidInJune = [
    { service_type: 'Rent', service_date: '2026-06-18', engine_hours_at_service: null },
  ]

  it('measures a yearly bill from when it was last paid', () => {
    const [item] = computeDueStatus([scheduleEvery(1, 'year')], paidInJune, null, today)
    expect(item.dueOnDate).toBe('2027-06-18')
    expect(item.status).toBe('ok')
  })

  it('measures a weekly item in weeks', () => {
    const [item] = computeDueStatus([scheduleEvery(2, 'week')], paidInJune, null, today)
    expect(item.dueOnDate).toBe('2026-07-02')
    expect(item.status).toBe('overdue')
  })

  it('measures a daily item in days', () => {
    const [item] = computeDueStatus([scheduleEvery(45, 'day')], paidInJune, null, today)
    expect(item.dueOnDate).toBe('2026-08-02')
    expect(item.status).toBe('soon')
  })

  it('never reports an hour figure for an item with no hour interval', () => {
    const [item] = computeDueStatus([scheduleEvery(1, 'year')], paidInJune, 4000, today)
    expect(item.dueAtHours).toBeNull()
    expect(item.hoursRemaining).toBeNull()
  })

  it('is overdue while nothing has ever been logged against it', () => {
    const [item] = computeDueStatus([scheduleEvery(1, 'year')], [], null, today)
    expect(item.dueOnDate).toBeNull()
    expect(item.status).toBe('overdue')
  })

  it('ignores a time interval with no unit', () => {
    const [item] = computeDueStatus(
      [{ ...oilSchedule, interval_unit: null }],
      [
        {
          service_type: 'Engine oil & filter',
          service_date: '2026-06-01',
          engine_hours_at_service: 400,
        },
      ],
      420,
      today,
    )
    expect(item.dueOnDate).toBeNull()
    expect(item.dueAtHours).toBe(500)
  })
})
