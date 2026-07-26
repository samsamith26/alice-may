'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import type { Role } from '@/lib/auth/membership'

const PRIMARY = [
  { href: '/trips', label: 'Trips' },
  { href: '/map', label: 'Map' },
  { href: '/fuel', label: 'Fuel' },
  { href: '/maintenance', label: 'Service' },
  { href: '/tides', label: 'Tides' },
] as const

const MORE = [
  { href: '/stats', label: 'Lifetime stats', crewOnly: false },
  { href: '/documents', label: 'Documents', crewOnly: false },
  { href: '/float-plan', label: 'Float plan', crewOnly: false },
  { href: '/boat', label: 'Boat specs', crewOnly: false },
  { href: '/crew', label: 'Crew roster', crewOnly: true },
  { href: '/access', label: 'Crew & access', crewOnly: true },
] as const

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

export function NavTabs({ role, compact = false }: { role: Role; compact?: boolean }) {
  const pathname = usePathname()

  return (
    <ul
      className={
        compact
          ? 'flex items-stretch justify-around'
          : 'flex items-center gap-1 overflow-x-auto'
      }
    >
      {PRIMARY.map((item) => {
        const active = isActive(pathname, item.href)
        return (
          <li key={item.href} className={compact ? 'flex-1' : undefined}>
            <Link
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={
                compact
                  ? `annotation flex min-h-14 flex-col items-center justify-center gap-1 ${
                      active
                        ? 'text-magenta-500'
                        : 'text-hull-700/70 dark:text-chart-200/60'
                    }`
                  : `rounded-md px-3 py-1.5 text-sm font-medium ${
                      active
                        ? 'bg-magenta-500/12 text-magenta-600 dark:text-magenta-400'
                        : 'text-hull-700/80 hover:bg-hull-800/8 dark:text-chart-200/70 dark:hover:bg-chart-100/8'
                    }`
              }
            >
              {item.label}
            </Link>
          </li>
        )
      })}
      {role === 'crew' ? (
        <li className={compact ? 'flex-1' : undefined}>
          <Link
            href="/trips/new"
            className={
              compact
                ? 'annotation flex min-h-14 flex-col items-center justify-center gap-1 text-magenta-500'
                : 'rounded-md bg-magenta-500 px-3 py-1.5 text-sm font-semibold text-white'
            }
          >
            Log trip
          </Link>
        </li>
      ) : null}
    </ul>
  )
}

export function MoreMenu({ role, email }: { role: Role; email: string }) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onPointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const items = MORE.filter((item) => !item.crewOnly || role === 'crew')

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="annotation min-h-11 rounded-md border border-hull-800/20 px-3 dark:border-chart-200/20"
      >
        More
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-30 mt-2 w-60 rounded-lg border border-chart-300 bg-chart-50 p-1.5 shadow-lg dark:border-hull-700 dark:bg-hull-900"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="block rounded-md px-3 py-2.5 text-sm hover:bg-hull-800/8 dark:hover:bg-chart-100/8"
            >
              {item.label}
            </Link>
          ))}

          <div className="mt-1.5 border-t border-chart-300/70 px-3 pb-1 pt-2 dark:border-hull-700/70">
            <p className="truncate text-xs text-hull-700/70 dark:text-chart-200/60">
              {email}
            </p>
            <p className="annotation mt-0.5 text-hull-700/60 dark:text-chart-200/50">
              {role === 'crew' ? 'Crew' : 'Viewer'}
            </p>
            <form action="/auth/signout" method="post" className="mt-2">
              <button
                type="submit"
                className="text-sm font-medium text-alarm-600 dark:text-alarm-500"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}
