'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, useTransition } from 'react'
import { createCrewMember } from '@/app/(app)/access/actions'
import { Annotation, Button, CONTROL } from '@/components/ui/primitives'

export type CrewOption = { id: string; label: string }

function summarise(chosen: CrewOption[]): string {
  if (chosen.length === 0) return 'Nobody yet'
  if (chosen.length <= 3) return chosen.map((person) => person.label).join(', ')
  return `${chosen[0].label}, ${chosen[1].label} and ${chosen.length - 2} more`
}

function byName(a: CrewOption, b: CrewOption) {
  return a.label.localeCompare(b.label)
}

/**
 * Who was aboard, as a sheet of checkboxes.
 *
 * Not a `<select multiple>`: iOS renders that as a scroll wheel that has to be
 * held open, which is hopeless on a moving boat with wet hands. Not the old
 * always-open row of chips either — the roster grows and the form is long
 * enough already. The whole roster still fits on one screen, so the sheet shows
 * it in one go rather than making anyone search.
 *
 * Owns the selection and writes it out as hidden `crew_ids` inputs, so the form
 * submits exactly the shape the server action already expects. Mounted only
 * once TripForm has read any stored draft, so `defaultSelected` is final.
 */
export function CrewPicker({
  options,
  defaultSelected,
  onSelectionChange,
}: {
  options: CrewOption[]
  defaultSelected: string[]
  onSelectionChange: (next: string[]) => void
}) {
  const [roster, setRoster] = useState(() => [...options].sort(byName))
  const [selected, setSelected] = useState(defaultSelected)
  const [open, setOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [adding, startAdd] = useTransition()
  const dialogRef = useRef<HTMLDialogElement>(null)

  /**
   * The selection as of right now, rather than as of the render a handler was
   * created in. Adding somebody new awaits a round trip to the server, so by
   * the time it finishes, `selected` in that closure can be several selections
   * out of date — and building the next list from it silently drops everyone
   * ticked in the meantime.
   */
  const selectedRef = useRef(selected)

  // showModal() is what gives the sheet its backdrop, focus trap and escape
  // key. There is no declarative equivalent.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function commit(next: string[]) {
    selectedRef.current = next
    setSelected(next)
    onSelectionChange(next)
  }

  function select(id: string) {
    const current = selectedRef.current
    if (current.includes(id)) return
    commit([...current, id])
  }

  function toggle(id: string) {
    const current = selectedRef.current
    commit(
      current.includes(id)
        ? current.filter((other) => other !== id)
        : [...current, id],
    )
  }

  function addPerson() {
    const name = newName.trim()
    if (name === '' || adding) return

    // Somebody typing a name that is already on the roster means "this person",
    // not "a second person with the same name".
    const existing = roster.find(
      (person) => person.label.toLowerCase() === name.toLowerCase(),
    )
    if (existing) {
      setNewName('')
      setError(null)
      select(existing.id)
      return
    }

    startAdd(async () => {
      const result = await createCrewMember(name)
      if (!result.ok) {
        setError(result.message)
        return
      }
      const person = { id: result.person.id, label: result.person.name }
      setRoster((current) => [...current, person].sort(byName))
      setNewName('')
      setError(null)
      select(person.id)
    })
  }

  const chosen = roster.filter((person) => selected.includes(person.id))
  const listId = 'crew-picker-title'

  return (
    <div className="flex flex-col gap-1.5">
      <Annotation>Who was aboard</Annotation>

      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`${CONTROL} flex items-center justify-between gap-3 py-2 text-left`}
      >
        <span className={chosen.length === 0 ? 'opacity-50' : undefined}>
          {summarise(chosen)}
        </span>
        <span className="annotation shrink-0 opacity-60">
          {chosen.length > 0 ? `${chosen.length} aboard` : 'Choose'}
        </span>
      </button>

      {selected.map((id) => (
        <input key={id} type="hidden" name="crew_ids" value={id} />
      ))}

      <dialog
        ref={dialogRef}
        aria-labelledby={listId}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          // On a modal dialog the backdrop is the dialog element itself.
          if (event.target === dialogRef.current) setOpen(false)
        }}
        className="fixed inset-x-0 bottom-0 top-auto m-0 max-h-[85dvh] w-full max-w-none rounded-t-2xl border border-chart-300/70 bg-chart-50 p-0 text-hull-950 backdrop:bg-hull-950/60 dark:border-hull-700/60 dark:bg-hull-900 dark:text-chart-100 sm:inset-0 sm:m-auto sm:h-fit sm:max-w-md sm:rounded-2xl"
      >
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between gap-3 border-b border-chart-300/70 px-4 py-3 dark:border-hull-700/60">
            <h2 id={listId} className="text-base font-semibold">
              Who was aboard
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="annotation min-h-11 px-2 text-magenta-600 dark:text-magenta-400"
            >
              Done
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-2">
            {roster.length === 0 ? (
              <p className="py-3 text-sm text-hull-700/75 dark:text-chart-200/65">
                Nobody on the roster yet. Add whoever came along below.
              </p>
            ) : (
              <ul className="flex flex-col">
                {roster.map((person) => (
                  <li key={person.id}>
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 border-b border-chart-300/50 text-base last:border-b-0 dark:border-hull-700/40">
                      <input
                        type="checkbox"
                        checked={selected.includes(person.id)}
                        onChange={() => toggle(person.id)}
                        className="size-5 accent-magenta-500"
                      />
                      {person.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-chart-300/70 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 dark:border-hull-700/60">
            <Annotation>Someone new</Annotation>
            <div className="flex gap-2">
              <input
                value={newName}
                onChange={(event) => setNewName(event.target.value)}
                onKeyDown={(event) => {
                  // This input sits inside the trip form. Enter would otherwise
                  // save the whole trip.
                  if (event.key !== 'Enter') return
                  event.preventDefault()
                  addPerson()
                }}
                placeholder="Their name"
                aria-label="Name of someone not on the roster"
                className={`${CONTROL} text-base`}
              />
              <Button
                type="button"
                variant="secondary"
                onClick={addPerson}
                disabled={adding || newName.trim() === ''}
                className="shrink-0"
              >
                {adding ? 'Adding…' : 'Add'}
              </Button>
            </div>
            {error ? (
              <p className="text-xs text-alarm-600 dark:text-alarm-500">{error}</p>
            ) : null}
            <p className="text-xs text-hull-700/70 dark:text-chart-200/60">
              Adds them to the roster and ticks them onto this trip. Emergency
              contacts go on the{' '}
              <Link href="/crew" className="underline">
                crew roster
              </Link>
              .
            </p>
          </div>
        </div>
      </dialog>
    </div>
  )
}
