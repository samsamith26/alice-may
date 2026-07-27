'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { recordTripPhotos } from '@/app/(app)/trips/photo-actions'
import { createClient } from '@/lib/supabase/client'
import {
  ALLOWED_IMAGE_TYPES,
  PHOTO_BUCKET,
  describeUploadProblem,
  objectPath,
} from '@/lib/storage/paths'
import { Button } from '@/components/ui/primitives'

export function PhotoUpload({
  tripId,
  boatId,
}: {
  tripId: string
  boatId: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function upload() {
    const files = Array.from(inputRef.current?.files ?? []).filter((f) => f.size > 0)
    if (files.length === 0) {
      setError('Choose at least one photo.')
      return
    }

    for (const file of files) {
      const problem = describeUploadProblem(file, ALLOWED_IMAGE_TYPES)
      if (problem) {
        setError(problem)
        return
      }
    }

    setBusy(true)
    setError(null)

    // Straight from the browser to storage. The session cookie travels with
    // it, so the storage policies still decide whether this is allowed.
    const supabase = createClient()
    const uploaded: string[] = []

    try {
      for (const [index, file] of files.entries()) {
        setProgress(`Uploading ${index + 1} of ${files.length}…`)

        const path = objectPath(boatId, `trips/${tripId}`, file.name)
        const { error: uploadError } = await supabase.storage
          .from(PHOTO_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })

        if (uploadError) {
          if (uploaded.length > 0) {
            await supabase.storage.from(PHOTO_BUCKET).remove(uploaded)
          }
          setError(uploadError.message)
          return
        }
        uploaded.push(path)
      }

      setProgress('Saving…')
      const result = await recordTripPhotos(tripId, uploaded)
      if (!result.ok) {
        setError(result.message ?? 'Could not save the photos.')
        return
      }

      if (inputRef.current) inputRef.current.value = ''
      router.refresh()
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        disabled={busy}
        onChange={() => setError(null)}
        className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-hull-800/10 file:px-4 file:text-sm file:font-semibold dark:file:bg-chart-100/10"
      />
      <Button type="button" variant="secondary" disabled={busy} onClick={upload}>
        {busy ? (progress ?? 'Uploading…') : 'Add photos'}
      </Button>
      {error ? (
        <p className="text-xs text-alarm-600 dark:text-alarm-500">{error}</p>
      ) : null}
    </div>
  )
}
