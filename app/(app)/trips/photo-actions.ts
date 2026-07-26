'use server'

import { revalidatePath } from 'next/cache'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET, objectPath } from '@/lib/storage/signed'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED_IMAGE = ['image/jpeg', 'image/png', 'image/webp', 'image/heic']

export type UploadState = { status: 'idle' } | { status: 'error'; message: string }

export async function uploadTripPhotos(
  _prev: UploadState,
  formData: FormData,
): Promise<UploadState> {
  const membership = await requireCrew()
  const tripId = String(formData.get('trip_id') ?? '')
  if (!tripId) return { status: 'error', message: 'Missing trip.' }

  const files = formData.getAll('photos').filter((f): f is File => f instanceof File)
  if (files.length === 0) return { status: 'error', message: 'Choose at least one photo.' }

  const supabase = await createClient()

  for (const file of files) {
    if (file.size === 0) continue
    if (file.size > MAX_BYTES) {
      return { status: 'error', message: `${file.name} is larger than 10 MB.` }
    }
    if (!ALLOWED_IMAGE.includes(file.type)) {
      return { status: 'error', message: `${file.name} is not an image.` }
    }

    const path = objectPath(membership.boatId, `trips/${tripId}`, file.name)
    const { error: uploadError } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false })

    if (uploadError) {
      return { status: 'error', message: uploadError.message }
    }

    const { error: rowError } = await supabase.from('trip_photos').insert({
      trip_id: tripId,
      storage_path: path,
      uploaded_by: membership.userId,
    })

    // Do not leave an orphaned object behind if the row fails to write.
    if (rowError) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path])
      return { status: 'error', message: rowError.message }
    }
  }

  revalidatePath(`/trips/${tripId}`)
  return { status: 'idle' }
}

export async function deleteTripPhoto(photoId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()

  const { data: photo } = await supabase
    .from('trip_photos')
    .select('id, trip_id, storage_path')
    .eq('id', photoId)
    .maybeSingle()

  if (!photo) return

  await supabase.storage.from(PHOTO_BUCKET).remove([photo.storage_path])
  await supabase.from('trip_photos').delete().eq('id', photoId)
  revalidatePath(`/trips/${photo.trip_id}`)
}
