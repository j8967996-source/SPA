-- Tip settlements are now defined by the specific tips they include (selected in
-- the Generate workspace), not by locking a whole half-month period. A tip can
-- only be settled once (tips.settlement_id is set on settle), which is the real
-- guard, so the period no-overlap exclusion is no longer appropriate — drop it.
ALTER TABLE public.tip_settlements DROP CONSTRAINT IF EXISTS no_tip_period_overlap;
