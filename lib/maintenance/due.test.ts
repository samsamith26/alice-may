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
})
