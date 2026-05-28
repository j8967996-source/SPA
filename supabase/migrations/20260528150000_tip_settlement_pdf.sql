-- A tip settlement keeps a copy of the per-period detail PDF (also attached to
-- the ERP AP Bill on post). Stored in the private 'tip-pdfs' bucket.

alter table public.tip_settlements
  add column if not exists pdf_file_path text;

insert into storage.buckets (id, name, public)
values ('tip-pdfs', 'tip-pdfs', false)
on conflict (id) do nothing;
