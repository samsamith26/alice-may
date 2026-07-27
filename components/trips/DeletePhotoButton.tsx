'use client'

import { useState, useTransition } from 'react'
import { deleteTripPhoto } from '@/app/(app)/trips/photo-actions'

export function DeletePhotoButton({ photoId }: { photoId: string }) {
  const [confirming, setConfirming] = useState(false)
  const [pending, startTransition] = useTransition()

  // Always visible, never hover-revealed: the primary device is a phone, and
  // a touch screen has no hover state to reveal it with.
  if (!confirming) {
    return (
      <button
        type="button"
        aria-label="Delete photo"
        onClick={() => setConfirming(true)}
        className="absolute right-1.5 top-1.5 flex min-h-9 min-w-9 items-center justify-center rounded-full bg-hull-950/75 text-sm text-white backdrop-blur-sm transition-colors hover:bg-alarm-500"
      >
        ✕
      </button>
    )
  }

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-md bg-hull-950/85 p-2 backdrop-blur-sm">
      <p className="text-xs font-medium text-white">Delete this photo?</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="min-h-9 rounded-md bg-white/15 px-3 text-xs font-semibold text-white"
        >
          Keep
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => startTransition(() => deleteTripPhoto(photoId))}
          className="min-h-9 rounded-md bg-alarm-500 px-3 text-xs font-semibold text-white disabled:opacity-60"
        >
          {pending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </div>
  )
}
