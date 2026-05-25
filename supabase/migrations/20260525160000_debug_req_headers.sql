-- TEMP feasibility probe: does a custom request header reach PostgREST's
-- request.headers GUC? Used to validate the audit "who" mechanism. Dropped by
-- the next migration once confirmed.
CREATE OR REPLACE FUNCTION public.debug_req_headers()
RETURNS jsonb LANGUAGE sql STABLE AS $$
  SELECT current_setting('request.headers', true)::jsonb;
$$;
GRANT EXECUTE ON FUNCTION public.debug_req_headers() TO service_role;
