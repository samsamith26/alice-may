'use client'

import { useState, useSyncExternalStore } from 'react'
import { Button } from '@/components/ui/primitives'

/** Neither value ever changes, so the store never notifies. */
const noSubscribe = () => () => {}

function useOrigin(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => '',
  )
}

function useCanShare(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => 'share' in navigator,
    () => false,
  )
}

export function CopyButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  const canShare = useCanShare()

  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setCopied(false)
    }
  }

  async function share() {
    try {
      await navigator.share({ title: 'Float plan', url })
    } catch {
      // The person dismissed the share sheet; nothing to report.
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <code className="block overflow-x-auto rounded-md bg-hull-800/8 px-3 py-2 text-xs dark:bg-chart-100/8">
        {url}
      </code>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" onClick={copy}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
        {canShare ? (
          <Button type="button" onClick={share}>
            Send it
          </Button>
        ) : null}
      </div>
    </div>
  )
}

export function ShareLink({ token }: { token: string }) {
  const origin = useOrigin()
  if (!origin) return null
  return <CopyButton url={`${origin}/fp/${token}`} />
}
