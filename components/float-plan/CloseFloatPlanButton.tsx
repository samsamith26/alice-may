'use client'

import { useTransition } from 'react'
import { closeFloatPlan } from '@/app/(app)/float-plan/actions'
import { Button } from '@/components/ui/primitives'

export function CloseFloatPlanButton({ planId }: { planId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => closeFloatPlan(planId))}
    >
      {pending ? 'Checking in…' : "Check in — I'm back"}
    </Button>
  )
}
