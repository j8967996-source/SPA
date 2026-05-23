-- Auto-cancel past-day no-show reservations even when nobody opens the app.
-- Mirrors the app's lazy sweep (cancelStaleReservations) so it also fires on a
-- schedule. pg_cron evaluates the schedule in UTC, so 16:05 UTC = 00:05 PHT.
create extension if not exists pg_cron;

-- Active (pending/confirmed) reservations whose PHT service day has already
-- passed and were never converted → cancelled (treated as no-show). Reversible.
create or replace function public.cancel_stale_reservations()
returns void
language sql
as $$
  update public.reservations
  set status = 'cancelled', updated_at = now()
  where status in ('reserved', 'confirmed')
    and deleted_at is null
    and desired_service_start <
        (date_trunc('day', (now() at time zone 'Asia/Manila')) at time zone 'Asia/Manila');
$$;

-- (Re)schedule the daily job. Unschedule first so re-running the migration
-- doesn't stack duplicates on older pg_cron versions.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'cancel-stale-reservations') then
    perform cron.unschedule('cancel-stale-reservations');
  end if;
end $$;

select cron.schedule(
  'cancel-stale-reservations',
  '5 16 * * *',
  $$select public.cancel_stale_reservations();$$
);
