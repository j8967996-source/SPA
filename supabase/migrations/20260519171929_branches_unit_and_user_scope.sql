-- ===========================================================================
-- Two related scoping additions:
--   1. branches.business_unit_id   — each branch belongs to exactly one
--      business unit. Lets us derive "this user can see SPA branches only"
--      from a user's business-unit scope alone.
--   2. staff_user_business_units    — junction; a staff_user can be scoped
--      to N business units (admins typically all, store staff usually 1).
--      RLS policies will read this table once Auth wiring is in place.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. branches.business_unit_id
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  spa_id UUID := (SELECT id FROM public.business_units WHERE code = 'spa');
BEGIN
  ALTER TABLE public.branches ADD COLUMN business_unit_id UUID
    REFERENCES public.business_units(id) ON DELETE RESTRICT;

  -- Backfill: every existing branch is SPA (the only business line we have
  -- physical stores for today). Admins can re-assign in /settings/branches.
  UPDATE public.branches
     SET business_unit_id = spa_id
   WHERE business_unit_id IS NULL;

  -- Future inserts must specify a unit (NOT NULL after backfill).
  ALTER TABLE public.branches ALTER COLUMN business_unit_id SET NOT NULL;
END $$;

-- ---------------------------------------------------------------------------
-- 2. staff_user_business_units (junction)
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff_user_business_units (
  staff_user_id     UUID NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  business_unit_id  UUID NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_user_id, business_unit_id)
);
ALTER TABLE public.staff_user_business_units ENABLE ROW LEVEL SECURITY;

-- Backfill: existing users get scope to all currently-active business units.
-- (Admin will re-assign later via the user settings UI.)
INSERT INTO public.staff_user_business_units (staff_user_id, business_unit_id)
SELECT u.id, b.id
  FROM public.staff_users u
 CROSS JOIN public.business_units b
 WHERE b.active = true;
