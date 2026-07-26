'use client'

import { useTransition } from 'react'
import { deleteTripPhoto } from '@/app/(app)/trips/photo-actions'

export function DeletePhotoButton({ photoId }: { photoId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      aria-label="Delete photo"
      onClick={() => startTransition(() => deleteTripPhoto(photoId))}
      className="absolute right-1.5 top-1.5 min-h-9 min-w-9 rounded-full bg-hull-950/70 text-sm text-white opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
    >
      ✕
    </button>
  )
}
