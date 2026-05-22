-- Manual early bed release ("Ready now"). When a service finishes, its bed stays
-- occupied for the service's cleanup_after_minutes and auto-frees once elapsed.
-- Setting bed_released_at frees the bed immediately, before the buffer is up.
alter table public.order_items
  add column if not exists bed_released_at timestamptz;

comment on column public.order_items.bed_released_at is
  'When the bed was manually marked ready before its post-service cleanup buffer elapsed (Ready now). NULL = still within the auto cleanup window, or the line never occupied a bed.';
