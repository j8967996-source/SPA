-- Revert force-close columns added by 20260528085129_business_day_force_close.sql.
--
-- Decision: no manual override on the EoD close discipline. If a business day
-- is overdue (2+ days), operations stay blocked — the manager must actually
-- finish the proper EoD pipeline for that day. Books are reconciled daily;
-- mistakes are owned by whoever made them, not papered over with a button.

DROP INDEX IF EXISTS idx_bdc_forced_closed;

ALTER TABLE public.business_day_close
  DROP COLUMN IF EXISTS forced_close_reason,
  DROP COLUMN IF EXISTS forced_closed_by,
  DROP COLUMN IF EXISTS forced_closed_at;
