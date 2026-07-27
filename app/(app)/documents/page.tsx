import { requireMembership } from '@/lib/auth/membership'
import { createClient } from '@/lib/supabase/server'
import { DOCUMENT_BUCKET, signedUrls } from '@/lib/storage/signed'
import { daysUntilExpiry, documentStatus } from '@/lib/documents/expiry'
import { DocumentForm } from '@/components/documents/DocumentForm'
import { DeleteDocumentButton } from '@/components/documents/DeleteDocumentButton'
import { Annotation, Card, EmptyState, Pill } from '@/components/ui/primitives'

const STATUS_TONE = { ok: 'ok', expiring: 'soon', expired: 'overdue' } as const

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default async function DocumentsPage() {
  const membership = await requireMembership()
  const supabase = await createClient()

  const { data: documents } = await supabase
    .from('documents')
    .select('id, type, label, expires_on, storage_path, file_name')
    .eq('boat_id', membership.boatId)

  const rows = documents ?? []
  const today = new Date()

  // Anything needing attention floats to the top.
  const sorted = [...rows].sort((a, b) => {
    const order = { expired: 0, expiring: 1, ok: 2 }
    const byStatus =
      order[documentStatus(a.expires_on, today)] -
      order[documentStatus(b.expires_on, today)]
    if (byStatus !== 0) return byStatus
    return (a.expires_on ?? '9999').localeCompare(b.expires_on ?? '9999')
  })

  const urls = await signedUrls(
    DOCUMENT_BUCKET,
    rows.map((row) => row.storage_path).filter((path): path is string => Boolean(path)),
  )

  const isCrew = membership.role === 'crew'

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 text-sm text-hull-700/75 dark:text-chart-200/65">
          Registration, insurance, documentation, towing cover. Warnings start
          60 days out.
        </p>
      </div>

      {sorted.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {sorted.map((doc) => {
            const status = documentStatus(doc.expires_on, today)
            const days = daysUntilExpiry(doc.expires_on, today)
            const url = doc.storage_path ? urls.get(doc.storage_path) : null

            return (
              <li key={doc.id}>
                <Card className="flex flex-col gap-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">{doc.type}</p>
                      {doc.label ? (
                        <p className="text-sm opacity-70">{doc.label}</p>
                      ) : null}
                    </div>
                    <Pill tone={STATUS_TONE[status]}>
                      {status === 'expired'
                        ? 'expired'
                        : status === 'expiring'
                          ? `${days} days`
                          : 'in date'}
                    </Pill>
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-sm">
                    {doc.expires_on ? (
                      <span className="readout opacity-75">
                        Expires {shortDate(doc.expires_on)}
                      </span>
                    ) : (
                      <span className="opacity-60">No expiry</span>
                    )}
                    {url ? (
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-magenta-600 underline dark:text-magenta-400"
                      >
                        Open {doc.file_name ?? 'file'}
                      </a>
                    ) : null}
                    {isCrew ? <DeleteDocumentButton documentId={doc.id} /> : null}
                  </div>
                </Card>
              </li>
            )
          })}
        </ul>
      ) : (
        <EmptyState title="No documents stored">
          <p>Registration and insurance are the two worth having on your phone.</p>
        </EmptyState>
      )}

      {isCrew ? (
        <Card className="flex flex-col gap-4">
          <Annotation>Add a document</Annotation>
          <DocumentForm boatId={membership.boatId} />
        </Card>
      ) : null}
    </div>
  )
}
