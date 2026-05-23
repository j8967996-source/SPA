-- Optional bed/resource pinning for a reservation (the "hybrid" model).
-- A reservation is unassigned demand by default; when it matters (couples and
-- groups who want adjacent beds, VIPs, a specific room) the front desk can pin
-- one or more resources up front. Pinned resources show as ghost blocks in the
-- Station timeline; unpinned reservations stay in the top "Reservations" lane.
-- A reservation may pin up to its pax count of resources.
create table if not exists public.reservation_resources (
  reservation_id uuid not null references public.reservations(id) on delete cascade,
  resource_id    uuid not null references public.resources(id) on delete restrict,
  primary key (reservation_id, resource_id)
);
alter table public.reservation_resources enable row level security;

-- Look-ups go both ways: "what is pinned to this reservation" and "which
-- reservations have pinned this resource" (conflict checks).
create index if not exists reservation_resources_resource_idx
  on public.reservation_resources (resource_id);
