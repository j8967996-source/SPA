-- Tip settlements and commission periods are now scoped to a single branch
-- (like Cash Reconciliation / Revenue Confirm). Each branch settles its own
-- PAYMAYA tips / therapist commission for a period. Existing rows keep NULL
-- (legacy company-wide) — new ones always carry a branch.
alter table public.tip_settlements
  add column if not exists branch_id uuid references public.branches(id);

alter table public.commission_periods
  add column if not exists branch_id uuid references public.branches(id);
