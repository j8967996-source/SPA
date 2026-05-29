-- Customer branch scope: each customer record gains a home_branch_id so the
-- customers list / actions can be filtered to the viewer's allowed branches.
-- Existing rows are backfilled from their first stored-value-card branch (the
-- only place customers currently get created with a branch tie); anything
-- else stays NULL and is admin-only-visible until manually assigned.

alter table public.customers
  add column if not exists home_branch_id uuid references public.branches(id) on delete set null;

create index if not exists idx_customers_home_branch on public.customers(home_branch_id);

-- Backfill from stored_value_cards.branch_id (one card per customer in this
-- dataset; take the earliest by created_at if there are several).
update public.customers c
   set home_branch_id = svc.branch_id
  from (
    select distinct on (customer_id) customer_id, branch_id
      from public.stored_value_cards
     where customer_id is not null and branch_id is not null
     order by customer_id, created_at asc
  ) as svc
 where svc.customer_id = c.id
   and c.home_branch_id is null;
