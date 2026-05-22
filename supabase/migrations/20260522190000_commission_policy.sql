-- Per-branch commission rule engine.
--
--   commission = gross × class_rate × warm-up_multiplier
--
-- Three independent axes:
--   1. class_rate           — the therapist's class % (per-branch class via
--                             employee_branch_commission_class, else the
--                             employee default; the % itself stays global for
--                             now — resolved through one helper so a per-branch
--                             rate override can be added later without rework).
--   2. warm-up_multiplier   — the branch's commission policy (first-session rule).
--   3. occurrence/day       — ordered by actual_start, reset per calendar day.

create table if not exists public.commission_policies (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  name               text not null,
  warmup_enabled     boolean not null default true,
  warmup_occurrence  int not null default 1,   -- warm-up applies to the Nth commissionable session of the day
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
alter table public.commission_policies enable row level security;

-- Duration bands used when warm-up is enabled: a session in the warm-up
-- occurrence whose duration ≤ up_to_minutes gets rate_multiplier × class_rate.
-- up_to_minutes NULL = catch-all (longest). Lowest sort_order wins first match.
create table if not exists public.commission_policy_bands (
  id              uuid primary key default gen_random_uuid(),
  policy_id       uuid not null references public.commission_policies(id) on delete cascade,
  up_to_minutes   int,
  rate_multiplier numeric(5,4) not null,
  sort_order      int not null default 0
);
alter table public.commission_policy_bands enable row level security;

alter table public.branches
  add column if not exists commission_policy_id uuid references public.commission_policies(id);

-- A therapist's class can differ by branch (Fritz = J at OSP2, S at OSP1).
-- Falls back to employees.commission_class_id when a branch has no override.
create table if not exists public.employee_branch_commission_class (
  employee_id         uuid not null references public.employees(id) on delete cascade,
  branch_id           uuid not null references public.branches(id) on delete cascade,
  commission_class_id uuid not null references public.commission_classes(id),
  primary key (employee_id, branch_id)
);
alter table public.employee_branch_commission_class enable row level security;

-- Seed the current SPA2 rule as the default policy and assign it to every branch:
--   warm-up on the day's 1st session — ≤90 min → ×0, otherwise (120) → ×0.5.
insert into public.commission_policies (code, name, warmup_enabled, warmup_occurrence)
values ('DEFAULT', 'Standard (warm-up)', true, 1)
on conflict (code) do nothing;

insert into public.commission_policy_bands (policy_id, up_to_minutes, rate_multiplier, sort_order)
select p.id, v.up_to, v.mult, v.so
from public.commission_policies p
cross join (values (90, 0.0, 1), (null::int, 0.5, 2)) as v(up_to, mult, so)
where p.code = 'DEFAULT'
  and not exists (select 1 from public.commission_policy_bands b where b.policy_id = p.id);

update public.branches
set commission_policy_id = (select id from public.commission_policies where code = 'DEFAULT')
where commission_policy_id is null;
