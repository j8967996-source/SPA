-- ===========================================================================
-- A staff user (esp. a manager) can be responsible for more than one branch.
-- staff_users.home_branch_id stays as the PRIMARY / default branch; this
-- junction records the full set of branches the user may access.
-- Visibility narrows on (accessible branches ∩ accessible business units).
-- ===========================================================================
CREATE TABLE public.staff_user_branches (
  staff_user_id  UUID NOT NULL REFERENCES public.staff_users(id) ON DELETE CASCADE,
  branch_id      UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  PRIMARY KEY (staff_user_id, branch_id)
);
ALTER TABLE public.staff_user_branches ENABLE ROW LEVEL SECURITY;

-- Backfill: existing users with a home branch get that branch as their
-- initial accessible set. Admins widen it later.
INSERT INTO public.staff_user_branches (staff_user_id, branch_id)
SELECT id, home_branch_id
  FROM public.staff_users
 WHERE home_branch_id IS NOT NULL;
