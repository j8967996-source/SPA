-- ===========================================================================
-- A single physical branch can host more than one business unit (e.g. a hotel
-- wellness floor running both SPA and Gym). Promote branches.business_unit_id
-- (single FK) to a branch_business_units junction (multi).
--
-- Row-level data (resources, employees, orders) already carries its own
-- business_unit_id, so the actual SPA-vs-Gym split inside a shared branch keeps
-- working — this junction only records which units operate at each branch.
-- ===========================================================================

CREATE TABLE public.branch_business_units (
  branch_id         UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  business_unit_id  UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  PRIMARY KEY (branch_id, business_unit_id)
);
ALTER TABLE public.branch_business_units ENABLE ROW LEVEL SECURITY;

-- Backfill from the existing single FK.
INSERT INTO public.branch_business_units (branch_id, business_unit_id)
SELECT id, business_unit_id
  FROM public.branches
 WHERE business_unit_id IS NOT NULL;

ALTER TABLE public.branches DROP COLUMN business_unit_id;
