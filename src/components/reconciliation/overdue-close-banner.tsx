import Link from 'next/link';
import { AlertTriangle, CalendarX } from 'lucide-react';

import { cn } from '@/lib/utils';

export interface OverdueCloseInfo {
  branch_id: string;
  branch_code: string;
  business_date: string;
  days_overdue: number;
}

/**
 * Daily-close discipline banner. Shows on dashboard + reconciliation hub when
 * any branch has an open business day older than yesterday.
 *
 *  - 1 day overdue → amber warning; financial actions still allowed
 *  - 2+ days overdue → red error; Revenue Confirm / SOA Settle / SOA Payment /
 *    Tip Settlement / Commission Settlement all hard-blocked
 *
 * There is intentionally NO force-close override: an overdue day must be
 * closed by running the proper EoD pipeline (Order Review → Balance →
 * Revenue Confirm → Close). The banner links to End-of-Day for that branch.
 */
export function OverdueCloseBanner({ items }: { items: OverdueCloseInfo[] }) {
  if (items.length === 0) return null;
  const maxOverdue = Math.max(...items.map((i) => i.days_overdue));
  const blocking = maxOverdue >= 2;

  return (
    <div className={cn(
      'flex flex-col gap-2 rounded-xl border px-4 py-3',
      blocking
        ? 'border-destructive/40 bg-destructive/5'
        : 'border-amber-500/40 bg-amber-500/5',
    )}>
      <div className="flex items-start gap-2">
        {blocking ? (
          <AlertTriangle className="size-5 shrink-0 text-destructive mt-0.5" />
        ) : (
          <CalendarX className="size-5 shrink-0 text-amber-700 dark:text-amber-400 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-bold',
            blocking ? 'text-destructive' : 'text-amber-800 dark:text-amber-300',
          )}>
            {blocking
              ? 'Business day not closed — financial actions are blocked.'
              : 'Reminder: yesterday\'s business day is not closed yet.'}
          </p>
          <p className={cn(
            'text-xs font-medium mt-0.5',
            blocking ? 'text-destructive/80' : 'text-amber-700/80 dark:text-amber-400/80',
          )}>
            {blocking
              ? 'Revenue Confirm / SOA Settle / Tip Settlement / Commission Settlement won\'t run until the day is closed. Finish the End-of-Day pipeline for that day first.'
              : 'Close it today on End-of-Day to keep books current.'}
          </p>
        </div>
      </div>

      <ul className="flex flex-col gap-1 ml-7">
        {items.map((i) => (
          <li key={`${i.branch_id}-${i.business_date}`} className="flex items-center justify-between gap-3 text-sm">
            <span className="font-semibold">
              <span className="font-mono font-bold">{i.branch_code}</span>
              <span className="mx-2 text-muted-foreground">·</span>
              {i.business_date}
              <span className={cn(
                'ml-2 inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-bold',
                i.days_overdue >= 2
                  ? 'bg-destructive/15 text-destructive'
                  : 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
              )}>
                {i.days_overdue}d overdue
              </span>
            </span>
            <Link
              href={`/reconciliation/end-of-day?branch=${i.branch_id}&date=${i.business_date}`}
              className="text-xs font-bold text-primary hover:underline shrink-0"
            >
              Go to EoD →
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
