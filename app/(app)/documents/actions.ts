'use server'

import { revalidatePath } from 'next/cache'
import { requireCrew } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { DOCUMENT_BUCKET, objectPath } from '@/lib/storage/signed'
import { documentSchema } from '@/lib/validation/schemas'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
]

export type DocumentState =
  | { status: 'idle' }
  | { status: 'saved' }
  | { status: 'error'; message: string }

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

  const supabase = await createClient()
  const file = formData.get('file')
  let storagePath: string | null = null
  let fileName: string | null = null

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_BYTES) {
      return { status: 'error', message: 'That file is larger than 10 MB.' }
    }
    if (!ALLOWED.includes(file.type)) {
      return { status: 'error', message: 'Upload a PDF or an image.' }
    }

    storagePath = objectPath(membership.boatId, 'documents', file.name)
    const { error: uploadError } = await supabase.storage
      .from(DOCUMENT_BUCKET)
      .upload(storagePath, file, { contentType: file.type, upsert: false })

    if (uploadError) return { status: 'error', message: uploadError.message }
    fileName = file.name
  }

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
