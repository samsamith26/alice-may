/*
 * Geometry and the y grid, shared by the server-rendered charts and the
 * interactive line chart. No hooks or handlers, so it renders on either side.
 */

export const WIDTH = 320
export const PAD = { top: 10, right: 8, bottom: 22, left: 34 }

export function Grid({
  ticks,
  y,
  height,
}: {
  ticks: number[]
  y: (value: number) => number
  height: number
}) {
  return (
    <g>
      {ticks.map((tick) => (
        <g key={tick}>
          <line
            x1={PAD.left}
            x2={WIDTH - PAD.right}
            y1={y(tick)}
            y2={y(tick)}
            className="stroke-hull-800/12 dark:stroke-chart-200/12"
            strokeWidth="0.6"
          />
          <text
            x={PAD.left - 5}
            y={y(tick) + 3}
            textAnchor="end"
            className="fill-hull-800/60 text-[8px] dark:fill-chart-200/55"
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {Number.isInteger(tick) ? tick : tick.toFixed(1)}
          </text>
        </g>
      ))}
      <line
        x1={PAD.left}
        x2={WIDTH - PAD.right}
        y1={height - PAD.bottom}
        y2={height - PAD.bottom}
        className="stroke-hull-800/30 dark:stroke-chart-200/30"
        strokeWidth="0.8"
      />
    </g>
  )
}
