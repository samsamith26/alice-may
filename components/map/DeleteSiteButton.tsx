'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { deletePoi } from '@/app/(app)/map/actions'
import { Button } from '@/components/ui/primitives'

export function DeleteSiteButton({ siteId }: { siteId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()
  const router = useRouter()

  if (!confirming) {
    return (
      <Button variant="secondary" onClick={() => setConfirming(true)}>
        Delete site
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
        onClick={() =>
          startTransition(async () => {
            await deletePoi(siteId)
            router.push('/map')
          })
        }
      >
        {pending ? 'Deleting…' : 'Delete for good'}
      </Button>
    </div>
  )
}
