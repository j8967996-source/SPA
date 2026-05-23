-- Grace window (minutes) after a reservation's desired start. Past this, an
-- active reservation is flagged "Overdue" and its pinned beds are auto-released
-- (computed at read time — no status change, no cron). Editable in Settings.
insert into public.settings (key, value, value_type, scope, branch_id, description)
select 'reservation_overdue_grace_minutes', '30', 'integer', 'global', null,
       'Minutes after a reservation''s desired start before it is flagged Overdue and its pinned beds are auto-released.'
where not exists (
  select 1 from public.settings where key = 'reservation_overdue_grace_minutes' and branch_id is null
);
