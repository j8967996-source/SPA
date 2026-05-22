-- Each service category maps to the resource type it consumes (massage_bed,
-- hair_chair, nail_station, rest_room…). Used to plan bed/station capacity for
-- reservations. Backfilled from the resource type the category's service items
-- most commonly require.
alter table public.service_categories
  add column if not exists required_resource_type text;

update public.service_categories sc
set required_resource_type = ranked.rt
from (
  select service_category_id, required_resource_type as rt
  from (
    select service_category_id, required_resource_type,
           row_number() over (
             partition by service_category_id
             order by count(*) desc
           ) as rn
    from public.service_items
    where required_resource_type is not null
    group by service_category_id, required_resource_type
  ) t
  where rn = 1
) ranked
where sc.id = ranked.service_category_id
  and sc.required_resource_type is null;

-- A reservation can need several service types (e.g. hair + massage). Multi-select
-- via a junction; the single reservations.service_category_id column is kept for
-- back-compat but the junction is now the source of truth.
create table if not exists public.reservation_service_categories (
  reservation_id      uuid not null references public.reservations(id) on delete cascade,
  service_category_id uuid not null references public.service_categories(id) on delete restrict,
  primary key (reservation_id, service_category_id)
);
alter table public.reservation_service_categories enable row level security;

-- Seed the junction from the existing single-category value.
insert into public.reservation_service_categories (reservation_id, service_category_id)
select id, service_category_id
from public.reservations
where service_category_id is not null
on conflict do nothing;
