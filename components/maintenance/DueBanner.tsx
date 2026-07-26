import Link from 'next/link'
import { Banner, Pill } from '@/components/ui/primitives'
import type { DueItem } from '@/lib/maintenance/due'

function phrase(item: DueItem): string {
  if (item.lastServiceDate === null) return 'never logged'

  if (item.hoursRemaining !== null && item.hoursRemaining < 0) {
    return `${Math.abs(Math.round(item.hoursRemaining))} hours past due`
  }
  if (item.daysRemaining !== null && item.daysRemaining < 0) {
    return `${Math.abs(item.daysRemaining)} days past due`
  }
  if (item.hoursRemaining !== null && item.hoursRemaining <= 20) {
    return `${Math.round(item.hoursRemaining)} hours left`
  }
  if (item.daysRemaining !== null) {
    return `${item.daysRemaining} days left`
  }
  return 'due soon'
}

/** Only surfaces what needs action; silence means everything is in date. */
export function DueBanner({ items }: { items: DueItem[] }) {
  const needsAttention = items.filter((item) => item.status !== 'ok')
  if (needsAttention.length === 0) return null

  const worst = needsAttention.some((item) => item.status === 'overdue')
    ? 'overdue'
    : 'soon'

  return (
    <Banner tone={worst}>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold">
            {worst === 'overdue' ? 'Service overdue' : 'Service due soon'}
          </span>
          <Link
            href="/maintenance"
            className="text-sm font-semibold underline underline-offset-2"
          >
            Open service log
          </Link>
        </div>
        <ul className="flex flex-col gap-1.5">
          {needsAttention.map((item) => (
            <li
              key={item.serviceType}
              className="flex flex-wrap items-center gap-2 text-sm"
            >
              <Pill tone={item.status}>{item.status}</Pill>
              <span>{item.serviceType}</span>
              <span className="opacity-70">— {phrase(item)}</span>
            </li>
          ))}
        </ul>
      </div>
    </Banner>
  )
}
