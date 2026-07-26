'use client'

import { useState, useTransition } from 'react'
import { deleteTrip } from '@/app/(app)/trips/actions'
import { Button } from '@/components/ui/primitives'

export function DeleteTripButton({ tripId }: { tripId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Delete
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" onClick={() => setConfirming(false)}>
        Keep
      </Button>
      <Button
        variant="danger"
        disabled={pending}
        onClick={() => startTransition(() => deleteTrip(tripId))}
      >
        {pending ? 'Deleting…' : 'Delete for good'}
      </Button>
    </div>
  )
}
