-- Allow reopening a closed cash-reconciliation shift (e.g. cash came in after
-- the drawer was counted). Reopen sets status back to 'open' so it can be
-- recounted; these columns keep the audit trail of who reopened it and why.
alter table public.cash_reconciliations
  add column if not exists reopened_at timestamptz,
  add column if not exists reopened_by_staff_id uuid references public.staff_users(id),
  add column if not exists reopen_reason text;
