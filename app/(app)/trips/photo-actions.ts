'use server'

import { revalidatePath } from 'next/cache'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET, isPathWithinBoat } from '@/lib/storage/paths'

/**
 * Records photos that the browser has already uploaded to storage.
 *
 * The bytes deliberately do not travel through here. A server action caps its
 * request body at 1 MB by default, and Vercel caps a serverless request near
 * 4.5 MB — a phone photo exceeds both, and the upload failed with an opaque
 * server error before it ever reached Supabase. The browser uploads straight
 * to storage under its own session, so the same storage policies apply, and
 * this action only writes the row.
 */
export async function recordTripPhotos(
  tripId: string,
  paths: string[],
): Promise<{ ok: boolean; message?: string }> {
  const membership = await requireCrew()

  if (paths.length === 0) return { ok: true }

  // The storage policy resolves membership from the leading path segment.
  // Refuse to record a row pointing anywhere outside this boat's prefix.
  const foreign = paths.filter((path) => !isPathWithinBoat(path, membership.boatId))
  if (foreign.length > 0) {
    return { ok: false, message: 'Those files do not belong to this boat.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.from('trip_photos').insert(
    paths.map((path) => ({
      trip_id: tripId,
      storage_path: path,
      uploaded_by: membership.userId,
    })),
  )

  if (error) {
    // Do not strand objects whose rows failed to write; nothing in the app
    // could ever show or delete them.
    await supabase.storage.from(PHOTO_BUCKET).remove(paths)
    return { ok: false, message: error.message }
  }

  revalidatePath(`/trips/${tripId}`)
  return { ok: true }
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
