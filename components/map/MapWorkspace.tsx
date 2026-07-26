'use client'

import dynamic from 'next/dynamic'
import { useActionState, useMemo, useState } from 'react'
import { savePoi, type PoiState } from '@/app/(app)/map/actions'
import type { MapMarker } from './MapCanvas'
import {
  Annotation,
  Button,
  Card,
  Field,
  NumberInput,
  Select,
  TextInput,
  Textarea,
} from '@/components/ui/primitives'

// Leaflet touches `window` at import time, so it must never be pulled into a
// server render.
const MapCanvas = dynamic(
  () => import('./MapCanvas').then((mod) => mod.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="h-[460px] w-full animate-pulse rounded-lg bg-hull-800/10 dark:bg-chart-100/5" />
    ),
  },
)

const CATEGORIES = ['dive site', 'anchorage', 'fishing spot', 'other'] as const

export function MapWorkspace({
  center,
  siteMarkers,
  tripMarkers,
  canEdit,
}: {
  center: [number, number]
  siteMarkers: MapMarker[]
  tripMarkers: MapMarker[]
  canEdit: boolean
}) {
  const [showTrips, setShowTrips] = useState(true)
  const [activeCategories, setActiveCategories] = useState<string[]>([...CATEGORIES])
  const [draft, setDraft] = useState<{ lat: string; lng: string } | null>(null)
  const [locating, setLocating] = useState(false)

  const [state, formAction, pending] = useActionState<PoiState, FormData>(savePoi, {
    status: 'idle',
  })

  const markers = useMemo(() => {
    const sites = siteMarkers.filter((m) => activeCategories.includes(m.category))
    return showTrips ? [...sites, ...tripMarkers] : sites
  }, [siteMarkers, tripMarkers, activeCategories, showTrips])

  function toggleCategory(category: string) {
    setActiveCategories((current) =>
      current.includes(category)
        ? current.filter((c) => c !== category)
        : [...current, category],
    )
  }

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setDraft({
          lat: position.coords.latitude.toFixed(5),
          lng: position.coords.longitude.toFixed(5),
        })
        setLocating(false)
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <MapCanvas
        center={center}
        markers={markers}
        onMapClick={
          canEdit
            ? (lat, lng) => setDraft({ lat: lat.toFixed(5), lng: lng.toFixed(5) })
            : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {CATEGORIES.map((category) => (
          <button
            key={category}
            type="button"
            onClick={() => toggleCategory(category)}
            aria-pressed={activeCategories.includes(category)}
            className={`annotation min-h-10 rounded-full border px-3 ${
              activeCategories.includes(category)
                ? 'border-magenta-500 bg-magenta-500/10 text-magenta-600 dark:text-magenta-400'
                : 'border-hull-800/20 opacity-60 dark:border-chart-200/20'
            }`}
          >
            {category}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowTrips((v) => !v)}
          aria-pressed={showTrips}
          className={`annotation min-h-10 rounded-full border px-3 ${
            showTrips
              ? 'border-shoal-500 bg-shoal-500/10 text-shoal-700 dark:text-shoal-300'
              : 'border-hull-800/20 opacity-60 dark:border-chart-200/20'
          }`}
        >
          trip starts
        </button>
      </div>

      {canEdit ? (
        <Card className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Annotation>Save a site</Annotation>
            <Button type="button" variant="secondary" onClick={useCurrentLocation}>
              {locating ? 'Getting position…' : 'Use my current location'}
            </Button>
          </div>

          <p className="text-sm text-hull-700/75 dark:text-chart-200/65">
            Tap the map to drop a pin, or use your current position if
            you&rsquo;re sitting over the spot right now.
          </p>

          <form action={formAction} className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <TextInput name="name" required placeholder="Metridium Fields" />
              </Field>
              <Field label="Category">
                <Select name="category" defaultValue="dive site">
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Latitude">
                <NumberInput
                  name="lat"
                  step="any"
                  required
                  value={draft?.lat ?? ''}
                  onChange={(event) =>
                    setDraft((d) => ({ lat: event.target.value, lng: d?.lng ?? '' }))
                  }
                />
              </Field>
              <Field label="Longitude">
                <NumberInput
                  name="lng"
                  step="any"
                  required
                  value={draft?.lng ?? ''}
                  onChange={(event) =>
                    setDraft((d) => ({ lat: d?.lat ?? '', lng: event.target.value }))
                  }
                />
              </Field>
              <Field label="Depth (ft)">
                <NumberInput name="depth_ft" step="1" />
              </Field>
            </div>

            <Field label="Notes">
              <Textarea
                name="notes"
                placeholder="Entry point, what's down there, best conditions."
              />
            </Field>

            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save site'}
            </Button>

            {state.status === 'error' ? (
              <p className="text-sm text-alarm-600 dark:text-alarm-500">
                {state.message}
              </p>
            ) : null}
            {state.status === 'saved' ? (
              <p className="text-sm text-ok-600 dark:text-ok-500">Site saved.</p>
            ) : null}
          </form>
        </Card>
      ) : null}
    </div>
  )
}
