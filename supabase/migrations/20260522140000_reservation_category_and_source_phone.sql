-- Reservations can specify the service type (massage / nail / …) up front, so
-- the front desk can plan the right station/therapist before check-in.
alter table public.reservations
  add column if not exists service_category_id uuid references public.service_categories(id);

-- Per-source contact-phone policy. A direct customer must leave a phone so we
-- can reach them to confirm; a booking that comes through a hotel front desk or
-- ENGO doesn't need one (that partner is the contact channel).
alter table public.customer_sources
  add column if not exists phone_required boolean not null default true;

-- Seed the policy from existing data: any source billed to a partner (a hotel
-- or ENGO — i.e. a default billing destination other than SELF / THIRD-PARTY)
-- is exempt from the guest phone. The rest stay required. Editable per source
-- in Settings → Customer Sources afterwards.
update public.customer_sources cs
set phone_required = false
from public.billing_destinations bd
where cs.default_billing_to_id = bd.id
  and bd.code not in ('SELF', 'THIRD-PARTY');
