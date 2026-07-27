'use server'

import { revalidatePath } from 'next/cache'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { DOCUMENT_BUCKET, isPathWithinBoat } from '@/lib/storage/paths'
import { documentSchema } from '@/lib/validation/schemas'

export type DocumentState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string }

/**
 * Saves document metadata. The file itself is uploaded by the browser first
 * and passed here as a storage path.
 *
 * The bytes do not travel through this action for the same reason trip photos
 * do not: a server action caps its body at 1 MB and Vercel caps a serverless
 * request near 4.5 MB, so a scanned registration would fail with an opaque
 * server error before reaching Supabase.
 */
export async function saveDocument(
  _prev: DocumentState,
  formData: FormData,
): Promise<DocumentState> {
  const membership = await requireCrew()

  const parsed = documentSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    return {
      status: 'error',
      message: parsed.error.issues[0]?.message ?? 'Check the form.',
    }
  }

  const storagePath = String(formData.get('storage_path') ?? '') || null
  const fileName = String(formData.get('file_name') ?? '') || null

  if (storagePath && !isPathWithinBoat(storagePath, membership.boatId)) {
    return { status: 'error', message: 'That file does not belong to this boat.' }
  }

  const supabase = await createClient()
  const { id, ...values } = parsed.data

  const { error } = id
    ? await supabase
        .from('documents')
        .update({
          ...values,
          ...(storagePath ? { storage_path: storagePath, file_name: fileName } : {}),
        })
        .eq('id', id)
    : await supabase.from('documents').insert({
        ...values,
        storage_path: storagePath,
        file_name: fileName,
        boat_id: membership.boatId,
        created_by: membership.userId,
      })

  if (error) {
    // Never strand an uploaded object whose row failed to write.
    if (storagePath) {
      await supabase.storage.from(DOCUMENT_BUCKET).remove([storagePath])
    }
    return { status: 'error', message: error.message }
  }

  revalidatePath('/documents')
  revalidatePath('/')
  return { status: 'saved' }
}

export async function deleteDocument(documentId: string): Promise<void> {
  await requireCrew()
  const supabase = await createClient()

  const { data: doc } = await supabase
    .from('documents')
    .select('id, storage_path')
    .eq('id', documentId)
    .maybeSingle()

  if (doc?.storage_path) {
    await supabase.storage.from(DOCUMENT_BUCKET).remove([doc.storage_path])
  }
  await supabase.from('documents').delete().eq('id', documentId)

  revalidatePath('/documents')
  revalidatePath('/')
}
