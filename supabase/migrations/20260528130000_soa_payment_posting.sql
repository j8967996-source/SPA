-- Per-payment ERP posting on third-party SOA collections. A statement can be
-- collected in several partials, each its own GL post (DR cash/bank / CR AR) with
-- its own voucher number — so the posting columns live on the PAYMENT row, not
-- the statement. proof_file_path holds the uploaded remittance slip / cash photo.

alter table public.revenue_soa_payments
  add column if not exists posting_status text,
  add column if not exists gl_batch_nbr text,
  add column if not exists posting_error text,
  add column if not exists proof_file_path text;
