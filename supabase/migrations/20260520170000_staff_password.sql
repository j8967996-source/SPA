-- Day-1 login uses a local bcrypt password on staff_users (ERP/Supabase-Auth
-- independent). The auth_user_id bridge to Supabase Auth stays for a future SSO.
ALTER TABLE public.staff_users
  ADD COLUMN password_hash TEXT;
