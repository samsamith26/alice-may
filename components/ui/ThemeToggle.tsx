'use client'

import { useEffect, useTransition } from 'react'
import { setTheme, type Theme } from '@/app/theme/actions'
import { Annotation } from './primitives'

const OPTIONS: Array<{ value: Theme; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Auto' },
]

export function ThemeToggle({ current }: { current: Theme }) {
  const [pending, startTransition] = useTransition()

  // With no cookie set, follow the device. Applied on the client because the
  // server cannot know the device preference.
  useEffect(() => {
    if (current !== 'system') return

    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.classList.toggle('dark', query.matches)
    }
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [current])

  return (
    <div className="flex flex-col gap-1.5">
      <Annotation>Appearance</Annotation>
      <div
        role="radiogroup"
        aria-label="Appearance"
        className="inline-flex rounded-md border border-hull-800/20 p-0.5 dark:border-chart-200/20"
      >
        {OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={current === option.value}
            disabled={pending}
            onClick={() => {
              // Update immediately; the cookie write follows.
              if (option.value !== 'system') {
                document.documentElement.classList.toggle(
                  'dark',
                  option.value === 'dark',
                )
              }
              startTransition(() => setTheme(option.value))
            }}
            className={`min-h-10 rounded px-3 text-sm font-medium ${
              current === option.value
                ? 'bg-magenta-500/12 text-magenta-600 dark:text-magenta-400'
                : 'opacity-70'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}
