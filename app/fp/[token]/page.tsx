import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { floatPlanState } from '@/lib/float-plan/expiry'

// The overdue state must never be served stale from a cache.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Float plan',
  robots: { index: false, follow: false },
}

type PlanPayload = {
  boat_name: string
  departure_at: string
  planned_return_at: string
  departure_point: string | null
  destination_notes: string | null
  shore_contact_name: string | null
  closed_at: string | null
  expires_at: string
  crew: Array<{
    name: string
    emergency_contact_name: string | null
    emergency_contact_phone: string | null
  }>
}

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function clock(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function FloatPlanPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const { data } = await supabase.rpc('get_float_plan', { p_token: token })
  const plan = data as PlanPayload | null

  // One message for unknown, expired, and malformed alike — distinguishing
  // them would let someone probe for valid tokens.
  if (!plan) {
    return (
      <main className="flex min-h-dvh flex-col justify-center bg-hull-950 px-6 py-16 text-chart-100">
        <div className="mx-auto w-full max-w-sm text-center">
          <h1 className="text-2xl font-semibold">This float plan isn&rsquo;t available</h1>
          <p className="mt-3 text-sm text-chart-200/70">
            The link may have expired. Ask whoever sent it for a current one.
          </p>
        </div>
      </main>
    )
  }

  const state = floatPlanState(plan, new Date())

  return (
    <main className="min-h-dvh bg-hull-950 px-5 py-10 text-chart-100">
      <div className="mx-auto flex w-full max-w-md flex-col gap-5">
        <header>
          <span className="annotation text-shoal-300">Float plan</span>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">
            {plan.boat_name}
          </h1>
        </header>

        {state === 'overdue' ? (
          <div className="rounded-lg border-2 border-alarm-500 bg-alarm-500/15 px-4 py-4">
            <p className="text-lg font-semibold text-alarm-500">Overdue</p>
            <p className="mt-1 text-sm">
              Expected back at {clock(plan.planned_return_at)} and hasn&rsquo;t
              checked in. If you can&rsquo;t reach anyone aboard, call the
              Coast Guard on VHF channel 16 or 911.
            </p>
          </div>
        ) : null}

        {state === 'closed' ? (
          <div className="rounded-lg border border-ok-500/50 bg-ok-500/12 px-4 py-3">
            <p className="font-semibold text-ok-500">Back safe</p>
            <p className="mt-1 text-sm">
              Checked in at {plan.closed_at ? clock(plan.closed_at) : 'the dock'}.
              Nothing to do.
            </p>
          </div>
        ) : null}

        {state === 'active' ? (
          <div className="rounded-lg border border-shoal-500/40 bg-shoal-500/10 px-4 py-3">
            <p className="font-semibold text-shoal-300">Out on the water</p>
            <p className="mt-1 text-sm">
              Due back {when(plan.planned_return_at)}. This page updates itself
              — check again then.
            </p>
          </div>
        ) : null}

        <section className="rounded-lg border border-hull-700 bg-hull-900/60 p-4">
          <h2 className="annotation text-chart-200/70">Plan</h2>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="opacity-60">Left</dt>
            <dd className="readout">{when(plan.departure_at)}</dd>
            <dt className="opacity-60">Due back</dt>
            <dd className="readout">{when(plan.planned_return_at)}</dd>
            {plan.departure_point ? (
              <>
                <dt className="opacity-60">From</dt>
                <dd>{plan.departure_point}</dd>
              </>
            ) : null}
            {plan.destination_notes ? (
              <>
                <dt className="opacity-60">Going</dt>
                <dd>{plan.destination_notes}</dd>
              </>
            ) : null}
          </dl>
        </section>

        <section className="rounded-lg border border-hull-700 bg-hull-900/60 p-4">
          <h2 className="annotation text-chart-200/70">Aboard</h2>
          {plan.crew.length > 0 ? (
            <ul className="mt-2 flex flex-col gap-3">
              {plan.crew.map((person) => (
                <li key={person.name} className="border-b border-hull-700/60 pb-3 last:border-0 last:pb-0">
                  <p className="font-medium">{person.name}</p>
                  {person.emergency_contact_name || person.emergency_contact_phone ? (
                    <p className="mt-0.5 text-sm text-chart-200/70">
                      In an emergency: {person.emergency_contact_name ?? 'contact'}
                      {person.emergency_contact_phone ? (
                        <>
                          {' — '}
                          <a
                            href={`tel:${person.emergency_contact_phone.replace(/[^\d+]/g, '')}`}
                            className="readout underline"
                          >
                            {person.emergency_contact_phone}
                          </a>
                        </>
                      ) : null}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-chart-200/60">Nobody listed.</p>
          )}
        </section>

        <p className="text-xs text-chart-200/50">
          This link expires on its own {when(plan.expires_at)}.
        </p>
      </div>
    </main>
  )
}
