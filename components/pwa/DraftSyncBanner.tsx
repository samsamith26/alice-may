'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { syncTripDraft } from '@/app/(app)/trips/actions'
import {
  clearDraft,
  hasExhaustedRetries,
  isSyncable,
  listQueuedDrafts,
  recordFailedAttempt,
  valuesToForm,
  type TripDraft,
} from '@/lib/offline/drafts'

const POLL_MS = 60_000

/**
 * Flushes trips that were saved without signal.
 *
 * A draft is cleared only on a confirmed successful write. A rejected draft
 * records a failed attempt and backs off, and one that exhausts its retries is
 * still kept and still listed — a trip typed at the helm must not disappear
 * quietly because a server was unhappy.
 */
export function DraftSyncBanner() {
  const [drafts, setDrafts] = useState<TripDraft[]>([])
  const [syncing, setSyncing] = useState(false)
  const inFlight = useRef(false)

  const flush = useCallback(async () => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setDrafts(await listQueuedDrafts())
      return
    }

    // Three triggers can overlap: the online event, the poll interval, and the
    // button. A React state flag is not a mutex — it updates asynchronously, so
    // a second run would read the same still-unclear draft and insert the trip
    // twice. Trip inserts carry no idempotency key.
    if (inFlight.current) return
    inFlight.current = true

    setSyncing(true)
    try {
      const queued = await listQueuedDrafts()
      const now = Date.now()

      for (const draft of queued) {
        if (!isSyncable(draft, now)) continue

        const result = await syncTripDraft(valuesToForm(draft.values))
        if (result.ok) {
          await clearDraft(draft.id)
        } else {
          await recordFailedAttempt(draft)
        }
      }
    } finally {
      inFlight.current = false
      setSyncing(false)
      setDrafts(await listQueuedDrafts())
    }
  }, [])

  useEffect(() => {
    let cancelled = false

    async function initialLoad() {
      const queued = await listQueuedDrafts()
      if (!cancelled) setDrafts(queued)
    }
    void initialLoad()

    const onOnline = () => void flush()
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => void flush(), POLL_MS)

    return () => {
      cancelled = true
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
    }
  }, [flush])

  if (drafts.length === 0) return null

  const stuck = drafts.filter(hasExhaustedRetries).length

  return (
    <div className="rounded-lg border border-magenta-500/40 bg-magenta-500/10 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>
          {drafts.length} trip{drafts.length === 1 ? '' : 's'} saved on this
          phone, not uploaded yet
          {stuck > 0 ? ` — ${stuck} keeps being rejected` : ''}.
        </span>
        <button
          type="button"
          disabled={syncing}
          onClick={() => void flush()}
          className="font-semibold underline underline-offset-2"
        >
          {syncing ? 'Uploading…' : 'Upload now'}
        </button>
      </div>
    </div>
  )
}
