import { describe, expect, it } from 'vitest'
import { computeDueStatus } from './due'

const today = new Date('2026-07-26T12:00:00Z')

const oilSchedule = {
  service_type: 'Engine oil & filter',
  interval_hours: 100,
  interval_months: 12,
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
          interval_months: 12,
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
      [{ ...oilSchedule, interval_months: null }],
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
            interval_months: null,
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
          interval_months: null,
          active: true,
        },
        {
          service_type: 'Late',
          interval_hours: 100,
          interval_months: null,
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
      [{ ...oilSchedule, interval_months: null }],
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

/* ------------------------------------------------- fixed annual billing -- */

const rent = {
  service_type: 'Rent',
  category: 'bill' as const,
  interval_hours: null,
  interval_months: null,
  annual_due_month: 7,
  annual_due_day: 1,
  active: true,
}

/** Rent is paid yearly on 1 July; today is 26 July 2026. */
describe('computeDueStatus, fixed annual items', () => {
  it('is due this year once the date has passed unpaid', () => {
    const [item] = computeDueStatus([rent], [], null, today)
    expect(item.dueOnDate).toBe('2026-07-01')
    expect(item.status).toBe('overdue')
  })

  it('rolls to next year once the current cycle is paid', () => {
    const [item] = computeDueStatus(
      [rent],
      [
        {
          service_type: 'Rent',
          service_date: '2026-07-03',
          engine_hours_at_service: null,
        },
      ],
      null,
      today,
    )
    expect(item.dueOnDate).toBe('2027-07-01')
    expect(item.status).toBe('ok')
  })

  it("does not let last year's payment satisfy this year", () => {
    // Paid in 2025, never in 2026. The 2026 cycle has arrived and is unpaid.
    const [item] = computeDueStatus(
      [rent],
      [
        {
          service_type: 'Rent',
          service_date: '2025-07-01',
          engine_hours_at_service: null,
        },
      ],
      null,
      today,
    )
    expect(item.dueOnDate).toBe('2026-07-01')
    expect(item.status).toBe('overdue')
  })

  it('looks ahead to this year while the date is still coming', () => {
    // 15 June: the cycle in force started 1 July 2025 and was paid, so what is
    // outstanding is 1 July 2026 — sixteen days off, which is "soon".
    const [item] = computeDueStatus(
      [rent],
      [
        {
          service_type: 'Rent',
          service_date: '2025-07-02',
          engine_hours_at_service: null,
        },
      ],
      null,
      new Date('2026-06-15T12:00:00Z'),
    )
    expect(item.dueOnDate).toBe('2026-07-01')
    expect(item.status).toBe('soon')
  })

  it('stays ok early in the cycle', () => {
    const [item] = computeDueStatus(
      [rent],
      [
        {
          service_type: 'Rent',
          service_date: '2025-07-02',
          engine_hours_at_service: null,
        },
      ],
      null,
      new Date('2026-01-15T12:00:00Z'),
    )
    expect(item.dueOnDate).toBe('2026-07-01')
    expect(item.status).toBe('ok')
  })

  it('never reports an hour figure, whatever the engine is reading', () => {
    const [item] = computeDueStatus([rent], [], 4000, today)
    expect(item.dueAtHours).toBeNull()
    expect(item.hoursRemaining).toBeNull()
  })

  it('handles a 1 January date without slipping a year', () => {
    const parking = {
      ...rent,
      service_type: 'Parking pass',
      annual_due_month: 1,
      annual_due_day: 1,
    }
    const [unpaid] = computeDueStatus([parking], [], null, today)
    expect(unpaid.dueOnDate).toBe('2026-01-01')

    const [paid] = computeDueStatus(
      [parking],
      [
        {
          service_type: 'Parking pass',
          service_date: '2026-01-04',
          engine_hours_at_service: null,
        },
      ],
      null,
      today,
    )
    expect(paid.dueOnDate).toBe('2027-01-01')
    expect(paid.status).toBe('ok')
  })

  it('clamps a 29 February date in a common year', () => {
    const leapling = {
      ...rent,
      service_type: 'Leap day levy',
      annual_due_month: 2,
      annual_due_day: 29,
    }
    const [item] = computeDueStatus([leapling], [], null, new Date('2027-06-01T12:00:00Z'))
    expect(item.dueOnDate).toBe('2027-02-28')
  })
})

/* -------------------------------------------------------- due overrides -- */

describe('computeDueStatus, manual overrides', () => {
  const lastOilChange = {
    service_type: 'Engine oil & filter',
    service_date: '2026-06-01',
    engine_hours_at_service: 400,
  }

  it('replaces the computed hour figure', () => {
    const [item] = computeDueStatus(
      [{ ...oilSchedule, due_at_hours_override: 450, override_anchor_date: '2026-06-01' }],
      [lastOilChange],
      440,
      today,
    )
    expect(item.dueAtHours).toBe(450)
    expect(item.hoursRemaining).toBe(10)
    expect(item.overridden).toBe(true)
  })

  it('replaces the computed date', () => {
    const [item] = computeDueStatus(
      [
        {
          ...oilSchedule,
          due_on_date_override: '2026-07-01',
          override_anchor_date: '2026-06-01',
        },
      ],
      [lastOilChange],
      410,
      today,
    )
    expect(item.dueOnDate).toBe('2026-07-01')
    expect(item.status).toBe('overdue')
  })

  it('leaves the other measure on its computed value', () => {
    // Overriding the date says nothing about hours.
    const [item] = computeDueStatus(
      [
        {
          ...oilSchedule,
          due_on_date_override: '2026-12-25',
          override_anchor_date: '2026-06-01',
        },
      ],
      [lastOilChange],
      410,
      today,
    )
    expect(item.dueAtHours).toBe(500)
    expect(item.dueOnDate).toBe('2026-12-25')
  })

  it('lapses once a newer service is logged', () => {
    // The exception was granted against the June entry. July supersedes it, and
    // the interval maths takes back over rather than the item staying pinned.
    const [item] = computeDueStatus(
      [{ ...oilSchedule, due_at_hours_override: 450, override_anchor_date: '2026-06-01' }],
      [
        lastOilChange,
        {
          service_type: 'Engine oil & filter',
          service_date: '2026-07-20',
          engine_hours_at_service: 460,
        },
      ],
      470,
      today,
    )
    expect(item.overridden).toBe(false)
    expect(item.dueAtHours).toBe(560)
  })

  it('applies to an item that has never been logged', () => {
    const [item] = computeDueStatus(
      [{ ...oilSchedule, due_on_date_override: '2026-12-01', override_anchor_date: null }],
      [],
      412,
      today,
    )
    expect(item.overridden).toBe(true)
    expect(item.status).toBe('ok')
  })

  it('overrides a fixed annual date too', () => {
    const [item] = computeDueStatus(
      // Without the override this would sit overdue on 1 July.
      [{ ...rent, due_on_date_override: '2026-08-15', override_anchor_date: null }],
      [],
      null,
      today,
    )
    expect(item.dueOnDate).toBe('2026-08-15')
    expect(item.status).toBe('soon')
  })
})
