'use client'

import { useState } from 'react'
import { Field, NumberInput } from '@/components/ui/primitives'
import {
  convertForField,
  nmToStatuteMiles,
  statuteMilesToNm,
} from '@/lib/format/units'

/**
 * Statute and nautical miles as a linked pair, miles first to match the rest
 * of the app.
 *
 * Only the field the user is NOT typing in gets rewritten. Recomputing the
 * typed field from its own converted output would round-trip the number and
 * quietly change it under the cursor — type 28.2 miles and watch it settle at
 * 28.19. Tracking which side was edited keeps the entered value exactly as
 * entered.
 *
 * Only distance_nm is submitted; statute miles is a generated column derived
 * from it in the database. The miles box has no name, so it never posts.
 */
export function DistanceFields({
  defaultNm,
  error,
}: {
  defaultNm?: string | null
  error?: string
}) {
  const seed = defaultNm ?? ''
  const [nm, setNm] = useState(seed)
  const [miles, setMiles] = useState(() =>
    convertForField(seed, nmToStatuteMiles),
  )

  function onNmChange(value: string) {
    setNm(value)
    setMiles(convertForField(value, nmToStatuteMiles))
  }

  function onMilesChange(value: string) {
    setMiles(value)
    setNm(convertForField(value, statuteMilesToNm))
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* DOM order is tab order: miles, then nm. */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Distance (miles)">
          <NumberInput
            step="0.1"
            inputMode="decimal"
            value={miles}
            onChange={(event) => onMilesChange(event.target.value)}
            aria-label="Distance in statute miles"
          />
        </Field>
        <Field label="Distance (nm)" error={error}>
          <NumberInput
            name="distance_nm"
            step="0.1"
            inputMode="decimal"
            value={nm}
            onChange={(event) => onNmChange(event.target.value)}
            aria-label="Distance in nautical miles"
          />
        </Field>
      </div>
      <p className="text-xs text-hull-700/70 dark:text-chart-200/60">
        Enter either one, the other fills in.
      </p>
    </div>
  )
}
