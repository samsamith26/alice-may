'use client'

import { useActionState } from 'react'
import { uploadTripPhotos, type UploadState } from '@/app/(app)/trips/photo-actions'
import { Button } from '@/components/ui/primitives'

export function PhotoUpload({ tripId }: { tripId: string }) {
  const [state, formAction, pending] = useActionState<UploadState, FormData>(
    uploadTripPhotos,
    { status: 'idle' },
  )

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="trip_id" value={tripId} />
      <input
        type="file"
        name="photos"
        accept="image/*"
        multiple
        className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-hull-800/10 file:px-4 file:text-sm file:font-semibold dark:file:bg-chart-100/10"
      />
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? 'Uploading…' : 'Add photos'}
      </Button>
      {state.status === 'error' ? (
        <p className="text-xs text-alarm-600 dark:text-alarm-500">{state.message}</p>
      ) : null}
    </form>
  )
}
