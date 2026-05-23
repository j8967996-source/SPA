-- Optional specific service for a reservation (Option 1). Walk-ins (guest present)
-- usually pick the exact service so the order line + therapist can be confirmed;
-- advance bookings can leave it null (category-only) and choose on arrival.
-- Never required, always editable.
alter table public.reservations
  add column if not exists service_item_id uuid references public.service_items(id);
