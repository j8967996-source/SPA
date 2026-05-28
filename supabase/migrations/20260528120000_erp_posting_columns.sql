-- ERP / GL posting outcome columns on the entities that post to Acumatica.
--
-- System-wide rule (see erp-posting design): any posting FAILURE reverts the
-- entity to its prior status and notes the error; SUCCESS records the voucher
-- (batch) number. `erp_posting_log` stays the per-attempt audit trail; these
-- denormalised columns are what each document shows in its header:
--   posting_status : 'posting' | 'posted' | 'failed'  (null = never posted)
--   gl_batch_nbr   : Acumatica journal batch number, set on success
--   posting_error  : last failure message, set on failure (cleared on success)

alter table public.orders
  add column if not exists posting_status text,
  add column if not exists gl_batch_nbr text,
  add column if not exists posting_error text;

alter table public.revenue_soa
  add column if not exists posting_status text,
  add column if not exists gl_batch_nbr text,
  add column if not exists posting_error text;

alter table public.tip_settlements
  add column if not exists posting_status text,
  add column if not exists gl_batch_nbr text,
  add column if not exists posting_error text;
