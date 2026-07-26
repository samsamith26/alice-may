import { createClient } from '@/lib/supabase/server'
import { PHOTO_BUCKET, signedUrls } from '@/lib/storage/signed'
import { Annotation, Card } from '@/components/ui/primitives'
import { PhotoUpload } from './PhotoUpload'
import { DeletePhotoButton } from './DeletePhotoButton'

export async function PhotoStrip({
  tripId,
  boatId,
  canEdit,
}: {
  tripId: string
  boatId: string
  canEdit: boolean
}) {
  void boatId

  const supabase = await createClient()
  const { data: photos } = await supabase
    .from('trip_photos')
    .select('id, storage_path, caption')
    .eq('trip_id', tripId)
    .order('sort_order')
    .order('created_at')

  const rows = photos ?? []
  const urls = await signedUrls(
    PHOTO_BUCKET,
    rows.map((row) => row.storage_path),
  )

  if (rows.length === 0 && !canEdit) return null

  return (
    <Card className="flex flex-col gap-3">
      <Annotation>Photos</Annotation>

      {rows.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rows.map((photo) => {
            const url = urls.get(photo.storage_path)
            if (!url) return null
            return (
              <li key={photo.id} className="group relative">
                <a href={url} target="_blank" rel="noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt={photo.caption ?? 'Trip photo'}
                    loading="lazy"
                    className="aspect-4/3 w-full rounded-md object-cover"
                  />
                </a>
                {canEdit ? <DeletePhotoButton photoId={photo.id} /> : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-sm opacity-60">No photos on this trip.</p>
      )}

      {canEdit ? <PhotoUpload tripId={tripId} /> : null}
    </Card>
  )
}
