'use client'

import { useActionState, useEffect, useId, useState } from 'react'
import { saveTrip, type TripFormState } from '@/app/(app)/trips/actions'
import {
  Annotation,
  Button,
  Card,
  Field,
  NumberInput,
  TextInput,
  Textarea,
} from '@/components/ui/primitives'
import { clearDraft, loadDraft, queueDraft, saveDraft } from '@/lib/offline/drafts'
import { DistanceFields } from './DistanceFields'

export type TripFormValues = Record<string, string | null | undefined>

export type PickerOption = { id: string; label: string }

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <Card className="flex flex-col gap-4">
      <Annotation>{title}</Annotation>
      {children}
    </Card>
  )
}

function CoordinatePair({
  label,
  latName,
  lngName,
  values,
}: {
  label: string
  latName: string
  lngName: string
  values: TripFormValues
}) {
  const [lat, setLat] = useState(values[latName] ?? '')
  const [lng, setLng] = useState(values[lngName] ?? '')
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function useCurrentLocation() {
    if (!('geolocation' in navigator)) {
      setError('This device cannot report a position.')
      return
    }
    setLocating(true)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(5))
        setLng(position.coords.longitude.toFixed(5))
        setLocating(false)
      },
      () => {
        setError('Could not get a position. Check location permission.')
        setLocating(false)
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${label} latitude`}>
          <NumberInput
            name={latName}
            step="any"
            value={lat ?? ''}
            onChange={(event) => setLat(event.target.value)}
          />
        </Field>
        <Field label={`${label} longitude`}>
          <NumberInput
            name={lngName}
            step="any"
            value={lng ?? ''}
            onChange={(event) => setLng(event.target.value)}
          />
        </Field>
      </div>
      <Button type="button" variant="secondary" onClick={useCurrentLocation}>
        {locating ? 'Getting position…' : `Use current location`}
      </Button>
      {error ? <p className="text-xs text-alarm-600">{error}</p> : null}
    </div>
  )
}

function CheckboxGroup({
  name,
  options,
  selected,
  emptyHint,
}: {
  name: string
  options: PickerOption[]
  selected: string[]
  emptyHint: string
}) {
  const groupId = useId()

  if (options.length === 0) {
    return (
      <p className="text-sm text-hull-700/70 dark:text-chart-200/60">{emptyHint}</p>
    )
  }

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-labelledby={groupId}>
      {options.map((option) => (
        <label
          key={option.id}
          className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-hull-800/20 px-3 text-sm has-checked:border-magenta-500 has-checked:bg-magenta-500/10 dark:border-chart-200/20"
        >
          <input
            type="checkbox"
            name={name}
            value={option.id}
            defaultChecked={selected.includes(option.id)}
            className="accent-magenta-500"
          />
          {option.label}
        </label>
      ))}
    </div>
  )
}

export function TripForm({
  values = {},
  crewOptions,
  siteOptions,
  selectedCrewIds = [],
  selectedSiteIds = [],
  draftKey,
}: {
  values?: TripFormValues
  crewOptions: PickerOption[]
  siteOptions: PickerOption[]
  selectedCrewIds?: string[]
  selectedSiteIds?: string[]
  draftKey: string
}) {
  const [state, formAction, pending] = useActionState<TripFormState, FormData>(
    saveTrip,
    { status: 'idle' },
  )
  const [restored, setRestored] = useState<TripFormValues | null>(null)
  const [ready, setReady] = useState(false)
  const [queued, setQueued] = useState(false)

  // Restore anything stranded by a previous session without signal.
  useEffect(() => {
    let cancelled = false
    loadDraft(draftKey)
      .then((draft) => {
        if (cancelled) return
        if (draft) setRestored(draft.values)
      })
      .finally(() => {
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [draftKey])

  const initial = { ...values, ...(restored ?? {}) }
  const errors = state.status === 'error' ? (state.fieldErrors ?? {}) : {}

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      event.preventDefault()
      const formData = new FormData(event.currentTarget)
      void queueDraft(draftKey, formData).then(() => setQueued(true))
    }
  }

  function onChange(event: React.FormEvent<HTMLFormElement>) {
    saveDraft(draftKey, new FormData(event.currentTarget))
  }

  if (queued) {
    return (
      <Card className="flex flex-col gap-3">
        <Annotation>Saved on this phone</Annotation>
        <p className="text-sm">
          You&rsquo;re offline, so this trip is stored here and will upload on
          its own once you have signal. You can close the app.
        </p>
      </Card>
    )
  }

  // The fields are uncontrolled, and React only applies defaultValue at mount.
  // Rendering before the stored draft has been read would leave the inputs
  // showing blanks that no later render can correct — and the first keystroke
  // would then overwrite the recovered draft with those blanks.
  if (!ready) {
    return (
      <div
        className="h-64 animate-pulse rounded-lg bg-hull-800/10 dark:bg-chart-100/5"
        aria-hidden
      />
    )
  }

  return (
    <form
      action={formAction}
      onSubmit={onSubmit}
      onChange={onChange}
      className="flex flex-col gap-4"
    >
      <input type="hidden" name="id" defaultValue={initial.id ?? ''} />

      {restored ? (
        <Card>
          <p className="text-sm">
            Restored an unsent draft from this device.{' '}
            <button
              type="button"
              className="font-semibold text-magenta-600 underline dark:text-magenta-400"
              onClick={() => {
                clearDraft(draftKey)
                setRestored(null)
              }}
            >
              Discard it
            </button>
          </p>
        </Card>
      ) : null}

      <Section title="When">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date" error={errors.trip_date?.[0]}>
            <TextInput
              name="trip_date"
              type="date"
              required
              defaultValue={initial.trip_date ?? new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Field label="Left dock" error={errors.departure_time?.[0]}>
            <TextInput
              name="departure_time"
              type="time"
              defaultValue={initial.departure_time ?? ''}
            />
          </Field>
          <Field label="Back at dock" error={errors.return_time?.[0]}>
            <TextInput
              name="return_time"
              type="time"
              defaultValue={initial.return_time ?? ''}
            />
          </Field>
        </div>
        <p className="text-xs text-hull-700/70 dark:text-chart-200/60">
          Departure time decides which hour of conditions gets recorded.
        </p>
      </Section>

      <Section title="Engine">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Hours at start" error={errors.engine_hours_start?.[0]}>
            <NumberInput
              name="engine_hours_start"
              step="0.1"
              defaultValue={initial.engine_hours_start ?? ''}
            />
          </Field>
          <Field label="Hours at end" error={errors.engine_hours_end?.[0]}>
            <NumberInput
              name="engine_hours_end"
              step="0.1"
              defaultValue={initial.engine_hours_end ?? ''}
            />
          </Field>
        </div>
      </Section>

      <Section title="Fuel">
        <p className="text-xs text-hull-700/75 dark:text-chart-200/65">
          Read these straight off the helm fuel gauge: gallons used since the
          tank was last full, not gallons remaining.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field
            label="Gallons used at start (from full)"
            error={errors.fuel_from_full_start_gal?.[0]}
          >
            <NumberInput
              name="fuel_from_full_start_gal"
              step="0.1"
              defaultValue={initial.fuel_from_full_start_gal ?? ''}
            />
          </Field>
          <Field label="Gallons added" error={errors.fuel_added_gal?.[0]}>
            <NumberInput
              name="fuel_added_gal"
              step="0.1"
              defaultValue={initial.fuel_added_gal ?? ''}
            />
          </Field>
          <Field
            label="Gallons used at end (from full)"
            error={errors.fuel_from_full_end_gal?.[0]}
          >
            <NumberInput
              name="fuel_from_full_end_gal"
              step="0.1"
              defaultValue={initial.fuel_from_full_end_gal ?? ''}
            />
          </Field>
        </div>
        <Field
          label="Price per gallon"
          hint="Used for cost per trip and annual spend."
          error={errors.fuel_price_per_gal?.[0]}
        >
          <NumberInput
            name="fuel_price_per_gal"
            step="0.001"
            defaultValue={initial.fuel_price_per_gal ?? ''}
          />
        </Field>

        <DistanceFields
          defaultNm={initial.distance_nm}
          error={errors.distance_nm?.[0]}
        />
      </Section>

      <Section title="Position">
        <CoordinatePair
          label="Start"
          latName="start_lat"
          lngName="start_lng"
          values={initial}
        />
        <CoordinatePair
          label="End"
          latName="end_lat"
          lngName="end_lng"
          values={initial}
        />
      </Section>

      <Section title="Aboard">
        <CheckboxGroup
          name="crew_ids"
          options={crewOptions}
          selected={selectedCrewIds}
          emptyHint="No crew on the roster yet. Add people under More → Crew roster."
        />
      </Section>

      <Section title="Sites visited">
        <CheckboxGroup
          name="site_ids"
          options={siteOptions}
          selected={selectedSiteIds}
          emptyHint="No saved sites yet. Add dive sites and anchorages on the map."
        />
      </Section>

      <Section title="Notes">
        <Field label="What happened" error={errors.notes?.[0]}>
          <Textarea
            name="notes"
            defaultValue={initial.notes ?? ''}
            placeholder="Fish caught, anything that sounded wrong, who did what."
          />
        </Field>
      </Section>

      {state.status === 'error' && state.message ? (
        <p className="text-sm text-alarm-600 dark:text-alarm-500">{state.message}</p>
      ) : null}

      <Button type="submit" disabled={pending} className="sticky bottom-24 md:bottom-4">
        {pending ? 'Saving…' : 'Save trip'}
      </Button>
    </form>
  )
}
