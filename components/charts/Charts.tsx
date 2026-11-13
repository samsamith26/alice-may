import { BarChartCanvas, type PlottedBar } from './BarChartCanvas'
import { LineChartCanvas } from './LineChartCanvas'
import type { Series } from './types'
import { Annotation, EmptyState } from '@/components/ui/primitives'

export type { Point, Series, TripPointMeta } from './types'
export { HBarChart } from './HBarChart'

/*
 * Hand-rolled SVG rather than a charting library: a smaller bundle over harbour
 * signal, and marks that match the instrument vocabulary instead of fighting a
 * library's defaults. These are server components — no hooks, no handlers —
 * except the line chart's plot, which is interactive and lives in
 * LineChartCanvas.
 */

/**
 * Trips in order, one evenly spaced slot each (x = slot index), with Jan/Jul
 * labels from `slotDates` where each half-year begins. The plot is a client
 * component for the per-point tooltip; deciding whether there is anything to
 * plot, and the legend, stay here on the server.
 */
export function LineChart({
  series,
  slotDates,
  height = 180,
  yLabel,
  title,
  emptyMessage = 'Not enough data yet',
}: {
  series: Series[]
  /** YYYY-MM-DD for each slot, in slot order. Omit for no x labels. */
  slotDates?: string[]
  height?: number
  yLabel?: string
  /** Names the chart for screen readers when there is no yLabel. */
  title?: string
  emptyMessage?: string
}) {
  const allPoints = series.flatMap((s) => s.points)
  if (allPoints.length < 2) {
    return <EmptyState title={emptyMessage} />
  }

  return (
    <figure className="flex flex-col gap-2">
      {yLabel ? <Annotation>{yLabel}</Annotation> : null}
      <LineChartCanvas
        series={series}
        slotDates={slotDates}
        height={height}
        ariaLabel={`${yLabel ?? title ?? 'Chart'}: ${series.map((s) => s.label).join(', ')}`}
      />
      {series.length > 1 ? (
        <ul className="flex flex-wrap gap-4">
          {series.map((s) => (
            <li key={s.label} className="flex items-center gap-1.5 text-xs">
              <span
                className={`h-0.5 w-4 rounded ${
                  s.tone === 'secondary' ? 'bg-shoal-500' : 'bg-magenta-500'
                }`}
              />
              {s.label}
            </li>
          ))}
        </ul>
      ) : null}
    </figure>
  )
}

export type Bar = {
  label: string
  value: number
  /** Tooltip heading; defaults to the label. */
  title?: string
  /** Tooltip figure, already formatted; overrides formatTooltip. */
  display?: string
  /** Where the tooltip's "View trip" link goes. */
  href?: string
}

/**
 * Vertical bars with a hover/tap tooltip giving each bar's exact figure.
 *
 * The data prep happens here, on the server: formatters are functions, which
 * cannot be handed to a client component, so every string the plot needs is
 * made now. The plot itself is a client component, server-rendered like any
 * other, so without JavaScript the chart still draws — just without tooltips.
 */
export function BarChart({
  bars,
  height = 180,
  yLabel,
  formatValue,
  formatTooltip,
  emptyMessage = 'Nothing to chart yet',
}: {
  bars: Bar[]
  height?: number
  yLabel?: string
  /** Supply to print each bar's figure above it, for charts read as amounts. */
  formatValue?: (value: number) => string
  /** The tooltip's figure; falls back to formatValue, then the bare number. */
  formatTooltip?: (value: number) => string
  emptyMessage?: string
}) {
  if (bars.length === 0) return <EmptyState title={emptyMessage} />

  const plotted: PlottedBar[] = bars.map((bar) => ({
    label: bar.label,
    value: bar.value,
    above: formatValue ? formatValue(bar.value) : undefined,
    title: bar.title ?? bar.label,
    valueText:
      bar.display ??
      (formatTooltip ?? formatValue ?? ((value: number) => String(value)))(bar.value),
    href: bar.href,
  }))

  return (
    <figure className="flex flex-col gap-2">
      {yLabel ? <Annotation>{yLabel}</Annotation> : null}
      <BarChartCanvas
        bars={plotted}
        height={height}
        ariaLabel={`${yLabel ?? 'Chart'}: ${plotted
          .map((bar) => `${bar.title} ${bar.valueText}`)
          .join(', ')}`}
      />
    </figure>
  )
}
