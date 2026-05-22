-- Correction: a therapist's class does NOT vary by branch — drop that table.
-- What varies per branch is the class → % mapping (each store can have its own
-- rate for J / S / M). Add a per-branch override; blank falls back to the
-- global commission_classes rate (resolved through resolveRate()).
drop table if exists public.employee_branch_commission_class;

create table if not exists public.branch_commission_rates (
  branch_id           uuid not null references public.branches(id) on delete cascade,
  commission_class_id uuid not null references public.commission_classes(id) on delete cascade,
  commission_rate     numeric(5,4) not null,
  primary key (branch_id, commission_class_id)
);
alter table public.branch_commission_rates enable row level security;
