-- Private storage bucket for AR collection proof (remittance slip / cash photo)
-- attached when recording a third-party SOA payment. Private — accessed only via
-- the server (service role) and short-lived signed URLs; no public access.

insert into storage.buckets (id, name, public)
values ('ar-proofs', 'ar-proofs', false)
on conflict (id) do nothing;
