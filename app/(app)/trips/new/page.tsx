import { requireCrew } from '@/lib/auth/membership'
import { getCrewOptions, getSiteOptions } from '@/lib/db/queries'
import { TripForm } from '@/components/trips/TripForm'

export default async function NewTripPage() {
  const membership = await requireCrew()
  const [crewOptions, siteOptions] = await Promise.all([
    getCrewOptions(membership.boatId),
    getSiteOptions(membership.boatId),
  ])

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-semibold tracking-tight">Log a trip</h1>
      <TripForm
        crewOptions={crewOptions}
        siteOptions={siteOptions}
        draftKey="trip-new"
      />
    </div>
  )
}
