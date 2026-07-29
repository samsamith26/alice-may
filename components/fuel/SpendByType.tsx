'use client'

import { useState } from 'react'
import { HBarChart } from '@/components/charts/Charts'
import { Annotation } from '@/components/ui/primitives'
import { formatDollars } from '@/lib/format/units'
import { totalsByType, type SpendEntry } from '@/lib/fuel/spend'

const ALL = 'all'

/**
 * Where the money went, by what it went on.
 *
 * Totals are worked out here rather than shipped per year from the server:
 * there are a few dozen entries in a whole logbook, so filtering is instant and
 * the alternative is sending the same numbers three times over.
 */
export function SpendByType({
  entries,
  years,
}: {
  entries: SpendEntry[]
  years: string[]
}) {
  const [selected, setSelected] = useState<string>(ALL)

  const rows = totalsByType(entries, selected === ALL ? null : selected)
  const total = rows.reduce((sum, row) => sum + row.value, 0)

  const options = [{ value: ALL, label: 'All years' }].concat(
    years.map((year) => ({ value: year, label: year })),
  )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Annotation>Spend by type</Annotation>
        <span className="readout text-sm font-medium">{formatDollars(total)}</span>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by year">
        {options.map((option) => {
          const active = option.value === selected
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelected(option.value)}
              aria-pressed={active}
              className={`min-h-10 rounded-md border px-3 text-sm font-medium transition-colors ${
                active
                  ? 'border-magenta-500 bg-magenta-500/12 text-magenta-600 dark:text-magenta-400'
                  : 'border-hull-800/20 text-hull-800/75 hover:bg-hull-800/6 dark:border-chart-200/20 dark:text-chart-200/75 dark:hover:bg-chart-100/8'
              }`}
            >
              {option.label}
            </button>
          )
        })}
      </div>

      <HBarChart
        bars={rows}
        formatValue={formatDollars}
        emptyMessage={
          selected === ALL
            ? 'Log a cost against a service or a tank of fuel to see this'
            : `Nothing recorded in ${selected}`
        }
      />
    </div>
  )
}
