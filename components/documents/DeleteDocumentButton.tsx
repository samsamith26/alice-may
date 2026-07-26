'use client'

import { useTransition } from 'react'
import { deleteDocument } from '@/app/(app)/documents/actions'

export function DeleteDocumentButton({ documentId }: { documentId: string }) {
  const [pending, startTransition] = useTransition()

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(() => deleteDocument(documentId))}
      className="text-sm font-medium text-alarm-600 underline dark:text-alarm-500"
    >
      {pending ? 'Deleting…' : 'Delete'}
    </button>
  )
}
