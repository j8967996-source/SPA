-- Initial service prices were seeded with a far-past effective_from sentinel
-- (2020-01-01). Re-baseline those opening segments to the SPA go-live date
-- (2026-05-01) so the Service Items "Validity" column shows a meaningful start.
-- Only the seeded opening segments match; later scheduled segments are untouched.
-- Shrinking the start (within the old range) can't create an overlap.
UPDATE public.service_item_prices
   SET effective_from = '2026-05-01'
 WHERE effective_from = '2020-01-01';
