import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { floatPlanState } from '@/lib/float-plan/expiry'
import { FloatPlanForm } from '@/components/float-plan/FloatPlanForm'
import { CloseFloatPlanButton } from '@/components/float-plan/CloseFloatPlanButton'
import { ShareLink } from '@/components/float-plan/ShareLink'
import { Annotation, Card, EmptyState, Pill } from '@/components/ui/primitives'

function when(iso: string) {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default async function FloatPlanPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const [{ data: crew }, { data: plans }] = await Promise.all([
    supabase
      .from('crew')
      .select('id, name')
      .eq('boat_id', membership.boatId)
      .order('name'),
    supabase
      .from('float_plans')
      .select(
        'id, token, departure_at, planned_return_at, expires_at, closed_at, departure_point',
      )
      .eq('boat_id', membership.boatId)
      .order('departure_at', { ascending: false })
      .limit(20),
  ])

  const isCrew = membership.role === 'crew'
  const now = new Date()

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Float plan</h1>
        <p className="mt-1 text-sm text-hull-700/75 dark:text-chart-200/65">
          Tell someone ashore who&rsquo;s aboard and when you&rsquo;re due back.
          They get a link that shows if you&rsquo;re overdue — no sign-in needed.
        </p>
      </div>

      {isCrew ? (
        <Card className="flex flex-col gap-4">
          <Annotation>Before you leave the dock</Annotation>
          <FloatPlanForm
            crewOptions={(crew ?? []).map((row) => ({ id: row.id, label: row.name }))}
          />
        </Card>
      ) : null}

      <div>
        <Annotation>Plans</Annotation>
        {plans && plans.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-2">
            {plans.map((plan) => {
              const state = floatPlanState(plan, now)
              return (
                <li key={plan.id}>
                  <Card className="flex flex-col gap-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium">{when(plan.departure_at)}</span>
                      <Pill
                        tone={
                          state === 'overdue'
                            ? 'overdue'
                            : state === 'closed'
                              ? 'ok'
                              : state === 'active'
                                ? 'soon'
                                : 'neutral'
                        }
                      >
                        {state}
                      </Pill>
                    </div>

                    <p className="readout text-sm opacity-75">
                      Due back {when(plan.planned_return_at)}
                      {plan.departure_point ? ` · from ${plan.departure_point}` : ''}
                    </p>

                    {state === 'active' || state === 'overdue' ? (
                      <div className="flex flex-col gap-3">
                        <ShareLink token={plan.token} />
                        {isCrew ? <CloseFloatPlanButton planId={plan.id} /> : null}
                      </div>
                    ) : null}
                  </Card>
                </li>
              )
            })}
          </ul>
        ) : (
          <div className="mt-2">
            <EmptyState title="No float plans yet">
              <p>
                Worth filing whenever you head out alone or further than usual.
              </p>
            </EmptyState>
          </div>
        )}
      </div>
    </div>
  )
}
