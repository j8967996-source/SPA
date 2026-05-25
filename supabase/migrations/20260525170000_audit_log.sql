-- ---------------------------------------------------------------------------
-- Audit log: full change history (before/after + who + when) for the
-- financially/operationally important tables. The "who" comes from the
-- x-staff-user-id request header set by the audited service client (verified
-- to reach PostgREST's request.headers). Auditing is best-effort — it must
-- never break the underlying business write.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.debug_req_headers();

CREATE TABLE public.audit_log (
  id          BIGSERIAL PRIMARY KEY,
  table_name  TEXT NOT NULL,
  row_id      UUID,
  action      TEXT NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  changed_by  UUID,                 -- staff_users.id (no FK: audit must survive user deletion)
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  before      JSONB,
  after       JSONB
);
CREATE INDEX idx_audit_log_table_row ON public.audit_log(table_name, row_id);
CREATE INDEX idx_audit_log_changed_at ON public.audit_log(changed_at DESC);
CREATE INDEX idx_audit_log_changed_by ON public.audit_log(changed_by);
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY; -- service-role only

CREATE OR REPLACE FUNCTION public.audit_capture()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_actor   UUID;
  v_row_id  UUID;
  v_before  JSONB;
  v_after   JSONB;
  v_idsrc   JSONB;
BEGIN
  -- who: x-staff-user-id request header (set by createAuditedClient)
  BEGIN
    v_actor := NULLIF(current_setting('request.headers', true)::json ->> 'x-staff-user-id', '')::uuid;
  EXCEPTION WHEN others THEN v_actor := NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    v_before := to_jsonb(OLD); v_after := NULL;        v_idsrc := v_before;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW); v_idsrc := v_after;
  ELSE
    v_before := NULL;          v_after := to_jsonb(NEW); v_idsrc := v_after;
  END IF;

  BEGIN v_row_id := (v_idsrc ->> 'id')::uuid; EXCEPTION WHEN others THEN v_row_id := NULL; END;

  -- Best-effort: never let an audit failure roll back the real write.
  BEGIN
    INSERT INTO public.audit_log(table_name, row_id, action, changed_by, before, after)
    VALUES (TG_TABLE_NAME, v_row_id, TG_OP, v_actor, v_before, v_after);
  EXCEPTION WHEN others THEN NULL;
  END;

  RETURN NULL; -- AFTER trigger
END;
$$;

-- Attach to the important tables (transactional + masters affecting money/access).
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'orders','order_items','order_customers','payments','tips','order_adjustments',
    'stored_value_cards','stored_value_transactions','cash_reconciliations',
    'tip_settlements','commission_periods','commission_entries',
    'revenue_soa','revenue_soa_orders','revenue_soa_payments','soa_adjustments',
    'business_day_close','feedback',
    'service_items','service_item_prices','discount_classes','payment_methods',
    'billing_destinations','transaction_codes','customer_sources','commission_classes',
    'branches','business_units','employees','employee_shifts','resources',
    'reservations','customers','staff_users','role_permissions','settings'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS zz_audit_trg ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER zz_audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.audit_capture()',
      t
    );
  END LOOP;
END $$;
