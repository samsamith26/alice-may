'use client'

import { useEffect } from 'react'

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    // Registering in development produces confusing stale-asset behaviour.
    if (process.env.NODE_ENV !== 'production') return
    if (!('serviceWorker' in navigator)) return

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable service worker costs offline caching, nothing more.
    })
  }, [])

  return null
}
