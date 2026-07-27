'use client'

import { useActionState, useRef, useState } from 'react'
import { saveDocument, type DocumentState } from '@/app/(app)/documents/actions'
import { createClient } from '@/lib/supabase/client'
import {
  ALLOWED_DOCUMENT_TYPES,
  DOCUMENT_BUCKET,
  describeUploadProblem,
  objectPath,
} from '@/lib/storage/paths'
import { Button, Field, Select, TextInput } from '@/components/ui/primitives'

const TYPES = [
  'Registration',
  'Insurance',
  'USCG documentation',
  'Towing membership',
  'Other',
] as const

export function DocumentForm({ boatId }: { boatId: string }) {
  const [state, formAction, pending] = useActionState<DocumentState, FormData>(
    saveDocument,
    { status: 'idle' },
  )
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  /**
   * Uploads the file straight to storage, then hands the action a path.
   * Sending the bytes through the action would hit the 1 MB server-action
   * body cap — a scanned registration clears that easily.
   */
  async function submit(formData: FormData) {
    setUploadError(null)
    const file = fileRef.current?.files?.[0]

    if (file && file.size > 0) {
      const problem = describeUploadProblem(file, ALLOWED_DOCUMENT_TYPES)
      if (problem) {
        setUploadError(problem)
        return
      }

      setUploading(true)
      try {
        const supabase = createClient()
        const path = objectPath(boatId, 'documents', file.name)
        const { error } = await supabase.storage
          .from(DOCUMENT_BUCKET)
          .upload(path, file, { contentType: file.type, upsert: false })

        if (error) {
          setUploadError(error.message)
          return
        }
        formData.set('storage_path', path)
        formData.set('file_name', file.name)
      } finally {
        setUploading(false)
      }
    }

    // The file input is not part of the submitted payload; only its path is.
    formData.delete('file')
    return formAction(formData)
  }

  const busy = pending || uploading

  return (
    <form action={submit} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type">
          <Select name="type" required defaultValue="Registration">
            {TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Expires on" hint="Leave blank if it doesn't expire.">
          <TextInput name="expires_on" type="date" />
        </Field>
      </div>

      <Field label="Label">
        <TextInput name="label" placeholder="Policy number, provider, anything useful" />
      </Field>

      <Field label="File" hint="PDF or a photo, up to 10 MB.">
        <input
          ref={fileRef}
          type="file"
          name="file"
          accept="application/pdf,image/*"
          className="text-sm file:mr-3 file:min-h-11 file:rounded-md file:border-0 file:bg-hull-800/10 file:px-4 file:text-sm file:font-semibold dark:file:bg-chart-100/10"
        />
      </Field>

      <Button type="submit" disabled={busy}>
        {uploading ? 'Uploading…' : pending ? 'Saving…' : 'Save document'}
      </Button>

      {uploadError ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{uploadError}</p>
      ) : null}
      {state.status === 'error' ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
      ) : null}
      {state.status === 'saved' ? (
        <p className="text-sm text-ok-600 dark:text-ok-500">Document saved.</p>
      ) : null}
    </form>
  )
}
