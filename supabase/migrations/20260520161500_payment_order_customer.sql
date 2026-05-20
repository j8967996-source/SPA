-- Group customers can pay separately. A payment may be attributed to one guest
-- on the order (order_customer_id); NULL means a single payment covering the
-- whole order. Tips already attach to order_item + therapist + payment.
ALTER TABLE public.payments
  ADD COLUMN order_customer_id UUID REFERENCES public.order_customers(id) ON DELETE SET NULL;

CREATE INDEX idx_payments_order_customer ON public.payments(order_customer_id);
