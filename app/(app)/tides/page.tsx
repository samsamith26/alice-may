import { requireMembership } from '@/lib/auth/membership'
import { getBoat } from '@/lib/db/queries'
import { fetchTides } from '@/lib/conditions/noaa'
import { addDaysIso, todayInZone } from '@/lib/format/dates'
import { Annotation, Card, EmptyState } from '@/components/ui/primitives'

// Tide predictions for a fixed station do not change hour to hour, and this
// page gets refreshed from the car park repeatedly.
export const revalidate = 3600

const DAYS_AHEAD = 6

function clock(isoish: string): string {
  const time = isoish.split('T')[1] ?? ''
  const [rawHours, minutes] = time.split(':')
  const hours = Number(rawHours)
  if (!Number.isFinite(hours)) return isoish
  const suffix = hours >= 12 ? 'pm' : 'am'
  return `${hours % 12 === 0 ? 12 : hours % 12}:${minutes}${suffix}`
}

function dayName(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today'
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'long',
    day: 'numeric',
    month: 'short',
  })
}

export default async function TidesPage() {
  const membership = await requireMembership()
  const boat = await getBoat(membership.boatId)
  const station = boat?.tide_station_id ?? '9413450'

  // The server runs in UTC; the boat does not. Asking for the UTC date would
  // start the table on tomorrow from about 5pm Pacific onwards.
  const todayIso = todayInZone(new Date())
  const payload = await fetchTides(station, todayIso, addDaysIso(todayIso, DAYS_AHEAD))

  const byDay = new Map<string, Array<{ time: string; height: number; type: string }>>()
  for (const row of payload?.predictions ?? []) {
    const [date] = row.t.split(' ')
    const height = Number(row.v)
    if (!Number.isFinite(height)) continue
    const list = byDay.get(date) ?? []
    list.push({ time: row.t.replace(' ', 'T'), height, type: row.type })
    byDay.set(date, list)
  }

  const days = [...byDay.keys()].sort()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tides</h1>
        <p className="mt-1 text-sm text-hull-700/75 dark:text-chart-200/65">
          {boat?.home_port ?? 'Monterey'} — NOAA station {station}, heights above
          MLLW.
        </p>
      </div>

      {days.length === 0 ? (
        <EmptyState title="Tide predictions unavailable">
          <p>
            NOAA didn&rsquo;t answer just now. It&rsquo;s usually brief — try
            again in a few minutes.
          </p>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {days.map((day) => (
            <li key={day}>
              <Card className="flex flex-col gap-2">
                <Annotation>{dayName(day, todayIso)}</Annotation>
                <ul className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                  {(byDay.get(day) ?? []).map((tide) => (
                    <li key={tide.time} className="flex flex-col">
                      <span
                        className={`annotation ${
                          tide.type === 'H'
                            ? 'text-shoal-700 dark:text-shoal-300'
                            : 'text-hull-700/70 dark:text-chart-200/60'
                        }`}
                      >
                        {tide.type === 'H' ? 'High' : 'Low'}
                      </span>
                      <span className="readout text-lg">{clock(tide.time)}</span>
                      <span className="readout text-xs opacity-60">
                        {tide.height.toFixed(1)} ft
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-hull-700/60 dark:text-chart-200/50">
        Predictions from NOAA CO-OPS. Actual water levels vary with weather and
        barometric pressure.
      </p>
    </div>
  )
}
