'use client'

import { useCallback, useState, useTransition } from 'react'
import { deleteServiceEntry } from '@/app/(app)/maintenance/actions'
import { ServiceForm, type ServiceEntryValues } from './ServiceForm'
import { Button, Card, Readout } from '@/components/ui/primitives'
import { formatHours, formatMoney } from '@/lib/format/units'

function shortDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export function ServiceEntry({
  entry,
  serviceTypes,
  billTypes = [],
  canEdit,
}: {
  entry: ServiceEntryValues
  serviceTypes: string[]
  billTypes?: string[]
  canEdit: boolean
}) {
  const isBill = billTypes.includes(entry.service_type)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, startDelete] = useTransition()

  const close = useCallback(() => setEditing(false), [])

  if (editing) {
    return (
      <Card className="flex flex-col gap-4">
        <ServiceForm
          entry={entry}
          serviceTypes={serviceTypes}
          billTypes={billTypes}
          currentHours={null}
          onSaved={close}
          onCancel={close}
        />
      </Card>
    )
  }

  return (
    <Card className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium">{entry.service_type}</span>
        <span className="readout text-sm opacity-70">
          {shortDate(entry.service_date)}
        </span>
      </div>

      <div className="flex flex-wrap gap-x-5 text-sm">
        {isBill ? null : (
          <span>
            <span className="opacity-60">At </span>
            <Readout value={formatHours(entry.engine_hours_at_service)} unit="h" />
          </span>
        )}
        {entry.cost !== null ? (
          <span>
            <span className="opacity-60">{isBill ? 'Paid ' : 'Cost '}</span>
            <Readout value={formatMoney(entry.cost)} />
          </span>
        ) : null}
        {entry.performed_by ? (
          <span>
            <span className="opacity-60">{isBill ? 'To ' : 'By '}</span>
            {entry.performed_by}
          </span>
        ) : null}
      </div>

      {entry.notes ? (
        <p className="mt-1 whitespace-pre-wrap text-sm opacity-80">{entry.notes}</p>
      ) : null}

      {canEdit ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {confirmingDelete ? (
            <>
              <span className="text-sm opacity-75">Delete this entry?</span>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="text-sm font-medium underline"
              >
                Keep
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => startDelete(() => deleteServiceEntry(entry.id))}
                className="text-sm font-semibold text-alarm-600 underline dark:text-alarm-500"
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </>
          ) : (
            <>
              <Button
                variant="secondary"
                className="min-h-10 px-3 text-xs"
                onClick={() => setEditing(true)}
              >
                Edit
              </Button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-sm font-medium text-alarm-600 underline dark:text-alarm-500"
              >
                Delete
              </button>
            </>
          )}
        </div>
      ) : null}
    </Card>
  )
}
