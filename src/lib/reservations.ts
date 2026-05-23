import { createServiceClient } from '@/lib/supabase/server';

// Reservation statuses that are still "live" — they hold capacity/beds and can
// be flagged Overdue. Terminal statuses (converted/cancelled/no_show) are out.
export const ACTIVE_RESERVATION_STATUSES = ['reserved', 'confirmed'] as const;

// Fallback if the Settings row is missing.
export const DEFAULT_OVERDUE_GRACE_MIN = 30;

const GRACE_SETTING_KEY = 'reservation_overdue_grace_minutes';

// Global grace window (minutes). Past `desired_start + grace`, an active
// reservation is Overdue. Read from Settings; falls back to the default.
export async function getReservationGraceMinutes(): Promise<number> {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('key', GRACE_SETTING_KEY)
    .is('branch_id', null)
    .maybeSingle();
  const n = Number(data?.value);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_OVERDUE_GRACE_MIN;
}

// Housekeeping: once a day has rolled over (past midnight PHT), an active
// reservation whose desired day has already passed counts as a no-show and is
// auto-cancelled. Runs lazily whenever the reservations/schedule pages load — no
// cron needed. Cancelled is reversible via Reopen if it was a mistake.
export async function cancelStaleReservations(): Promise<void> {
  const supabase = createServiceClient();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  await supabase
    .from('reservations')
    .update({ status: 'cancelled' })
    .in('status', ['reserved', 'confirmed'])
    .is('deleted_at', null)
    .lt('desired_service_start', `${today}T00:00:00+08:00`);
}

// Overdue = an active reservation whose desired start passed more than the grace
// window ago. Such reservations keep their status but auto-release pinned beds.
export function isReservationOverdue(opts: {
  status?: string;
  desiredStartIso: string;
  graceMin: number;
  nowMs?: number;
}): boolean {
  if (opts.status && !ACTIVE_RESERVATION_STATUSES.includes(opts.status as (typeof ACTIVE_RESERVATION_STATUSES)[number])) {
    return false;
  }
  const now = opts.nowMs ?? Date.now();
  return Date.parse(opts.desiredStartIso) + opts.graceMin * 60_000 < now;
}
