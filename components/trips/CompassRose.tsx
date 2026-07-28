import { compassPoint } from '@/lib/format/units'

/**
 * Wind and swell on a chart compass rose.
 *
 * The magenta inner ring is not decoration: on a printed nautical chart the
 * magnetic rose is always magenta, and this is the app's one borrowed
 * flourish. The wind needle points the way the wind is going, with the
 * cardinal name it came from spelled out beside it — the number alone is easy
 * to misread at a glance on deck.
 */
/**
 * Trigonometry is allowed to differ in its last bit between JavaScript engines,
 * and the server and the browser are not running the same one. Unrounded, a
 * tick lands on 50 in Node and 50.000000000000004 in the browser, React sees
 * two different attributes for the same element, and the whole tree reports a
 * hydration mismatch. Three decimals on a 100-unit viewBox is far finer than
 * anything that can be seen.
 */
function place(value: number): number {
  return Number(value.toFixed(3))
}

export function CompassRose({
  windDirDeg,
  windSpeedKn,
  swellDirDeg,
  size = 148,
}: {
  windDirDeg: number | null
  windSpeedKn: number | null
  swellDirDeg: number | null
  size?: number
}) {
  const centre = 50
  const ticks = Array.from({ length: 36 }, (_, i) => i * 10)

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      role="img"
      aria-label={
        windDirDeg === null
          ? 'No wind direction recorded'
          : `Wind from ${compassPoint(windDirDeg)}${
              windSpeedKn === null ? '' : ` at ${Math.round(windSpeedKn)} knots`
            }`
      }
      className="shrink-0"
    >
      <circle
        cx={centre}
        cy={centre}
        r="46"
        className="fill-none stroke-hull-800/25 dark:stroke-chart-200/25"
        strokeWidth="0.8"
      />
      {/* The magnetic ring — magenta, as on a real chart. */}
      <circle
        cx={centre}
        cy={centre}
        r="36"
        className="fill-none stroke-magenta-500/45"
        strokeWidth="0.8"
      />

      {ticks.map((deg) => {
        const major = deg % 90 === 0
        const medium = deg % 30 === 0
        const length = major ? 8 : medium ? 5 : 2.5
        const radians = ((deg - 90) * Math.PI) / 180
        return (
          <line
            key={deg}
            x1={place(centre + Math.cos(radians) * 46)}
            y1={place(centre + Math.sin(radians) * 46)}
            x2={place(centre + Math.cos(radians) * (46 - length))}
            y2={place(centre + Math.sin(radians) * (46 - length))}
            className="stroke-hull-800/40 dark:stroke-chart-200/35"
            strokeWidth={major ? 1.2 : 0.6}
          />
        )
      })}

      {(['N', 'E', 'S', 'W'] as const).map((label, index) => {
        const radians = ((index * 90 - 90) * Math.PI) / 180
        return (
          <text
            key={label}
            x={place(centre + Math.cos(radians) * 30)}
            y={place(centre + Math.sin(radians) * 30 + 2.6)}
            textAnchor="middle"
            className="fill-hull-800/70 text-[7px] font-semibold dark:fill-chart-200/70"
          >
            {label}
          </text>
        )
      })}

      {swellDirDeg !== null ? (
        <g transform={`rotate(${swellDirDeg} ${centre} ${centre})`}>
          <path
            d="M50 22 L50 78"
            className="stroke-shoal-500/70"
            strokeWidth="2.5"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        </g>
      ) : null}

      {windDirDeg !== null ? (
        <g transform={`rotate(${windDirDeg + 180} ${centre} ${centre})`}>
          <path
            d="M50 20 L45.5 33 L50 30.5 L54.5 33 Z"
            className="fill-magenta-500"
          />
          <path
            d="M50 30 L50 72"
            className="stroke-magenta-500"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </g>
      ) : null}

      <circle cx={centre} cy={centre} r="2" className="fill-magenta-500" />
    </svg>
  )
}
