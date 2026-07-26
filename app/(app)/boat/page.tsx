import { requireMembership } from '@/lib/auth/membership'
import { getBoat, getCurrentEngineHours } from '@/lib/db/queries'
import { Annotation, Card, Readout, StatTile } from '@/components/ui/primitives'
import { formatHours } from '@/lib/format/units'

export default async function BoatPage() {
  const membership = await requireMembership()
  const [boat, currentHours] = await Promise.all([
    getBoat(membership.boatId),
    getCurrentEngineHours(membership.boatId),
  ])

  if (!boat) {
    return <p className="text-sm opacity-70">No boat on record.</p>
  }

  const specs: Array<[string, string]> = [
    ['Make and model', boat.make_model ?? '—'],
    ['Year', boat.year ? String(boat.year) : '—'],
    ['Engine', boat.engine_make_model ?? '—'],
    ['Fuel capacity', boat.fuel_capacity_gal ? `${boat.fuel_capacity_gal} gal` : '—'],
    ['Home port', boat.home_port ?? '—'],
    ['Tide station', boat.tide_station_id ?? '—'],
  ]

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Annotation>{boat.home_port}</Annotation>
        <h1 className="text-2xl font-semibold tracking-tight">{boat.name}</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Engine hours" value={formatHours(currentHours)} />
        <StatTile
          label="Tank"
          value={boat.fuel_capacity_gal ? String(boat.fuel_capacity_gal) : '—'}
          unit="gal"
        />
      </div>

      <Card className="flex flex-col gap-3">
        <Annotation>Specifications</Annotation>
        <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-2 text-sm">
          {specs.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="opacity-60">{label}</dt>
              <dd className="readout">{value}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {boat.home_lat !== null && boat.home_lng !== null ? (
        <Card className="flex flex-col gap-2">
          <Annotation>Home position</Annotation>
          <p className="text-sm opacity-75">
            Used for conditions when a trip has no GPS point of its own.
          </p>
          <Readout value={`${boat.home_lat.toFixed(4)}, ${boat.home_lng.toFixed(4)}`} />
        </Card>
      ) : null}
    </div>
  )
}
