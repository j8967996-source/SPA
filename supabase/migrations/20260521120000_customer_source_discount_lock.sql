-- Group sources (e.g. hotels) bill every guest the same negotiated discount.
-- When discount_locked is true, the source's default_discount_class_id is
-- forced on all order items and can't be overridden per item. Flexible sources
-- (walk-in) leave it false so each guest can get their own discount.
ALTER TABLE public.customer_sources
  ADD COLUMN discount_locked BOOLEAN NOT NULL DEFAULT false;
