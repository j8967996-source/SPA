-- ===========================================================================
-- HHG-SPA POS — Initial Schema (v0.1)
-- ===========================================================================
-- Mirrors the design in OneDrive/AI/SPA/SPA_POS_ER_Schema.md
-- 45+ tables. Money stored as INTEGER cents (×100). Currency PHP.
-- Soft delete via deleted_at where applicable. RLS enabled (no policies =
-- service-key access only by default; auth policies added per feature).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Extensions & helpers
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "btree_gist";

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- MASTER: branches
-- ---------------------------------------------------------------------------
CREATE TABLE public.branches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  name        TEXT NOT NULL,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_branches_updated BEFORE UPDATE ON public.branches
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.branches ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MASTER: customers (only stored-value cardholders / future gym members)
-- ---------------------------------------------------------------------------
CREATE TABLE public.customers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone                       TEXT UNIQUE NOT NULL,
  name                        TEXT NOT NULL,
  gender                      TEXT,
  email                       TEXT,
  dob                         DATE,
  customer_type               TEXT,
  primary_business_unit       TEXT NOT NULL DEFAULT 'spa',
  membership_id               UUID,
  preferences                 JSONB,
  data_consent_at             TIMESTAMPTZ,
  data_deletion_requested_at  TIMESTAMPTZ,
  data_anonymized_at          TIMESTAMPTZ,
  status                      TEXT NOT NULL DEFAULT 'active',
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at                  TIMESTAMPTZ
);
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_customers_active ON public.customers(phone) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- MASTER: commission classes
-- ---------------------------------------------------------------------------
CREATE TABLE public.commission_classes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_code          TEXT UNIQUE NOT NULL,
  name                TEXT NOT NULL,
  commission_rate     NUMERIC(5,4) NOT NULL,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_commission_classes_updated BEFORE UPDATE ON public.commission_classes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.commission_classes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MASTER: employees
-- ---------------------------------------------------------------------------
CREATE TABLE public.employees (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code            TEXT UNIQUE NOT NULL,
  name                     TEXT NOT NULL,
  phone                    TEXT UNIQUE,
  email                    TEXT,
  gender                   TEXT,
  home_branch_id           UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  commission_class_id      UUID REFERENCES public.commission_classes(id),
  position                 TEXT,
  business_unit            TEXT NOT NULL DEFAULT 'spa',
  status                   TEXT NOT NULL DEFAULT 'active'
                           CHECK (status IN ('active','inactive','on_leave')),
  acumatica_user_id        TEXT UNIQUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by               UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at               TIMESTAMPTZ
);
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON public.employees
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_employees_branch_active ON public.employees(home_branch_id) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- MASTER: customer sources
-- ---------------------------------------------------------------------------
CREATE TABLE public.customer_sources (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT UNIQUE NOT NULL,
  name                        TEXT NOT NULL,
  default_billing_to_id       UUID,
  default_discount_class_id   UUID,
  active                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_customer_sources_updated BEFORE UPDATE ON public.customer_sources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.customer_sources ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MASTER: payment methods
-- ---------------------------------------------------------------------------
CREATE TABLE public.payment_methods (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT UNIQUE NOT NULL,
  display_name                TEXT NOT NULL,
  currency                    TEXT NOT NULL DEFAULT 'PHP',
  method_type                 TEXT NOT NULL DEFAULT 'one_time'
                              CHECK (method_type IN ('one_time','recurring','stored_value','prepaid_quota')),
  manual_reconciliation       BOOLEAN NOT NULL DEFAULT true,
  requires_reference          BOOLEAN NOT NULL DEFAULT false,
  debit_account               TEXT,
  debit_subaccount            TEXT,
  debit_branch                TEXT,
  credit_account              TEXT,
  credit_subaccount           TEXT,
  credit_branch               TEXT,
  active                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT pm_debit_sub_no_dash
    CHECK (debit_subaccount IS NULL OR debit_subaccount !~ '-'),
  CONSTRAINT pm_credit_sub_no_dash
    CHECK (credit_subaccount IS NULL OR credit_subaccount !~ '-')
);
CREATE TRIGGER trg_payment_methods_updated BEFORE UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MASTER: billing destinations
-- ---------------------------------------------------------------------------
CREATE TABLE public.billing_destinations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT UNIQUE NOT NULL,
  name                        TEXT NOT NULL,
  settlement_type             TEXT NOT NULL
                              CHECK (settlement_type IN ('intercompany','third_party')),
  intercompany_account        TEXT,
  intercompany_sub            TEXT,
  default_payment_method_id   UUID REFERENCES public.payment_methods(id),
  credit_terms_days           INTEGER NOT NULL DEFAULT 30,
  active                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT bt_intercompany_sub_no_dash
    CHECK (intercompany_sub IS NULL OR intercompany_sub !~ '-')
);
CREATE TRIGGER trg_billing_destinations_updated BEFORE UPDATE ON public.billing_destinations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.billing_destinations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_sources
  ADD CONSTRAINT fk_cs_default_billing
  FOREIGN KEY (default_billing_to_id) REFERENCES public.billing_destinations(id);

-- ---------------------------------------------------------------------------
-- MASTER: discount classes
-- ---------------------------------------------------------------------------
CREATE TABLE public.discount_classes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT UNIQUE NOT NULL,
  description                 TEXT NOT NULL,
  discount_percent            NUMERIC(5,2) NOT NULL DEFAULT 0,
  discount_amount_cents       INTEGER NOT NULL DEFAULT 0,
  requires_approval           BOOLEAN NOT NULL DEFAULT false,
  force_apply                 BOOLEAN NOT NULL DEFAULT false,
  active                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_discount_classes_updated BEFORE UPDATE ON public.discount_classes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.discount_classes ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.customer_sources
  ADD CONSTRAINT fk_cs_default_discount
  FOREIGN KEY (default_discount_class_id) REFERENCES public.discount_classes(id);

-- ---------------------------------------------------------------------------
-- MASTER: transaction codes
-- ---------------------------------------------------------------------------
CREATE TABLE public.transaction_codes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                TEXT UNIQUE NOT NULL,
  branch_id           UUID NOT NULL REFERENCES public.branches(id),
  transaction_type    TEXT NOT NULL
                      CHECK (transaction_type IN ('payment','settle','cost','adjust')),
  payment_method_id   UUID REFERENCES public.payment_methods(id),
  debit_account       TEXT,
  debit_subaccount    TEXT,
  debit_branch_id     UUID REFERENCES public.branches(id),
  credit_account      TEXT,
  credit_subaccount   TEXT,
  credit_branch_id    UUID REFERENCES public.branches(id),
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT tc_debit_sub_no_dash
    CHECK (debit_subaccount IS NULL OR debit_subaccount !~ '-'),
  CONSTRAINT tc_credit_sub_no_dash
    CHECK (credit_subaccount IS NULL OR credit_subaccount !~ '-')
);
CREATE TRIGGER trg_transaction_codes_updated BEFORE UPDATE ON public.transaction_codes
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.transaction_codes ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MASTER: service categories + items + prices
-- ---------------------------------------------------------------------------
CREATE TABLE public.service_categories (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT UNIQUE NOT NULL,
  name                        TEXT NOT NULL,
  business_unit               TEXT NOT NULL,
  commission_applicable       BOOLEAN NOT NULL DEFAULT true,
  tip_applicable              BOOLEAN NOT NULL DEFAULT true,
  revenue_account             TEXT,
  active                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_service_categories_updated BEFORE UPDATE ON public.service_categories
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.service_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_category_branches (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_category_id         UUID NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  branch_id                   UUID NOT NULL REFERENCES public.branches(id) ON DELETE CASCADE,
  enabled                     BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (service_category_id, branch_id)
);
ALTER TABLE public.service_category_branches ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                        TEXT UNIQUE NOT NULL,
  name                        TEXT NOT NULL,
  service_category_id         UUID NOT NULL REFERENCES public.service_categories(id),
  duration_minutes            INTEGER NOT NULL,
  prep_before_minutes         INTEGER NOT NULL DEFAULT 0,
  cleanup_after_minutes       INTEGER NOT NULL DEFAULT 0,
  required_resource_type      TEXT,
  pricing_model               TEXT NOT NULL DEFAULT 'per_session'
                              CHECK (pricing_model IN ('per_session','membership_unlimited','membership_quota','subscription')),
  commission_applicable       BOOLEAN NOT NULL DEFAULT true,
  tip_applicable              BOOLEAN NOT NULL DEFAULT true,
  business_unit               TEXT NOT NULL DEFAULT 'spa',
  active                      BOOLEAN NOT NULL DEFAULT true,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_service_items_updated BEFORE UPDATE ON public.service_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.service_items ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.service_item_prices (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_item_id     UUID NOT NULL REFERENCES public.service_items(id) ON DELETE CASCADE,
  price_class         TEXT NOT NULL DEFAULT 'Normal',
  branch_id           UUID REFERENCES public.branches(id),
  effective_from      DATE NOT NULL,
  effective_to        DATE NOT NULL,
  price_cents         INTEGER NOT NULL CHECK (price_cents > 0),
  currency            TEXT NOT NULL DEFAULT 'PHP',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by          UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_service_item_prices_updated BEFORE UPDATE ON public.service_item_prices
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.service_item_prices ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MASTER: resources
-- ---------------------------------------------------------------------------
CREATE TABLE public.resources (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                       UUID NOT NULL REFERENCES public.branches(id),
  resource_type                   TEXT NOT NULL,
  resource_name                   TEXT NOT NULL,
  location_zone                   TEXT,
  capacity                        INTEGER NOT NULL DEFAULT 1,
  business_unit                   TEXT NOT NULL DEFAULT 'spa',
  status                          TEXT NOT NULL DEFAULT 'active'
                                  CHECK (status IN ('active','cleaning','maintenance','closed')),
  status_changed_at               TIMESTAMPTZ,
  status_changed_by_user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status_until                    TIMESTAMPTZ,
  status_reason                   TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_resources_updated BEFORE UPDATE ON public.resources
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- MASTER: employee skills + shifts
-- ---------------------------------------------------------------------------
CREATE TABLE public.employee_service_categories (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  service_category_id         UUID NOT NULL REFERENCES public.service_categories(id) ON DELETE CASCADE,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, service_category_id)
);
ALTER TABLE public.employee_service_categories ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_shifts (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                     UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id                       UUID NOT NULL REFERENCES public.branches(id),
  shift_date                      DATE NOT NULL,
  shift_start                     TIME,
  shift_end                       TIME,
  shift_type                      TEXT NOT NULL
                                  CHECK (shift_type IN ('regular','cross_branch','on_call','off','leave')),
  leave_type                      TEXT CHECK (leave_type IS NULL OR leave_type IN ('sick','vacation','personal','unpaid')),
  override_commission_class_id    UUID REFERENCES public.commission_classes(id),
  generated_from_template         BOOLEAN NOT NULL DEFAULT false,
  note                            TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                      UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_employee_shifts_updated BEFORE UPDATE ON public.employee_shifts
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.employee_shifts ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_shifts_date_employee ON public.employee_shifts(shift_date, employee_id);

CREATE TABLE public.employee_shift_templates (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id         UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES public.branches(id),
  day_of_week         SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  shift_start         TIME,
  shift_end           TIME,
  shift_type          TEXT NOT NULL DEFAULT 'regular'
                      CHECK (shift_type IN ('regular','cross_branch','off')),
  max_weekly_hours    INTEGER NOT NULL DEFAULT 48,
  active              BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, day_of_week, branch_id)
);
CREATE TRIGGER trg_employee_shift_templates_updated BEFORE UPDATE ON public.employee_shift_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.employee_shift_templates ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.staffing_requirements (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                   UUID NOT NULL REFERENCES public.branches(id),
  day_of_week                 SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  time_block_start            TIME NOT NULL,
  time_block_end              TIME NOT NULL,
  min_therapists              INTEGER NOT NULL,
  min_senior_therapists       INTEGER NOT NULL DEFAULT 0,
  service_category_id         UUID REFERENCES public.service_categories(id),
  note                        TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_staffing_requirements_updated BEFORE UPDATE ON public.staffing_requirements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.staffing_requirements ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.employee_attendance (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id                 UUID NOT NULL REFERENCES public.employees(id),
  shift_id                    UUID REFERENCES public.employee_shifts(id) ON DELETE SET NULL,
  branch_id                   UUID NOT NULL REFERENCES public.branches(id),
  clock_in_at                 TIMESTAMPTZ NOT NULL,
  clock_out_at                TIMESTAMPTZ,
  clock_in_method             TEXT CHECK (clock_in_method IN ('biometric','card','qr','manual_entry')),
  clock_in_device_id          TEXT,
  clock_in_source             TEXT,
  late_minutes                INTEGER NOT NULL DEFAULT 0,
  early_leave_minutes         INTEGER NOT NULL DEFAULT 0,
  overtime_minutes            INTEGER NOT NULL DEFAULT 0,
  status                      TEXT CHECK (status IN ('present','late','early_leave','no_show','on_leave')),
  note                        TEXT,
  approved_by_staff_id        UUID,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_employee_attendance_updated BEFORE UPDATE ON public.employee_attendance
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SYSTEM: staff_users (auth.users bridge) — must exist before tables referencing it
-- ---------------------------------------------------------------------------
CREATE TABLE public.staff_users (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                           TEXT UNIQUE NOT NULL,
  acumatica_user_id               TEXT UNIQUE NOT NULL,
  auth_user_id                    UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name                    TEXT,
  role                            TEXT NOT NULL DEFAULT 'staff'
                                  CHECK (role IN ('admin','manager','staff','external_booker')),
  home_branch_id                  UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  active                          BOOLEAN NOT NULL DEFAULT false,
  last_login_at                   TIMESTAMPTZ,
  manager_pin_hash                TEXT,
  manager_pin_set_at              TIMESTAMPTZ,
  manager_pin_last_used_at        TIMESTAMPTZ,
  manager_pin_failed_attempts     INTEGER NOT NULL DEFAULT 0,
  manager_pin_locked_until        TIMESTAMPTZ,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_staff_users_updated BEFORE UPDATE ON public.staff_users
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.staff_users ENABLE ROW LEVEL SECURITY;

-- now wire approved_by FKs that referenced staff_users
ALTER TABLE public.employee_attendance
  ADD CONSTRAINT fk_ea_approved_by FOREIGN KEY (approved_by_staff_id) REFERENCES public.staff_users(id);

-- View for frontend to JOIN auth uid -> display_name
CREATE OR REPLACE VIEW public.v_audit_user AS
SELECT
  auth_user_id AS id,
  acumatica_user_id AS username,
  display_name,
  role
FROM public.staff_users
WHERE auth_user_id IS NOT NULL AND active = true;
GRANT SELECT ON public.v_audit_user TO authenticated;

-- ---------------------------------------------------------------------------
-- SYSTEM: role permission (Day 1 reserved), settings, audit logs
-- ---------------------------------------------------------------------------
CREATE TABLE public.role_permissions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role                TEXT NOT NULL,
  permission_name     TEXT NOT NULL,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (role, permission_name)
);
CREATE TRIGGER trg_role_permissions_updated BEFORE UPDATE ON public.role_permissions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.settings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key             TEXT NOT NULL,
  value           TEXT NOT NULL,
  value_type      TEXT NOT NULL CHECK (value_type IN ('string','integer','decimal','boolean')),
  description     TEXT,
  scope           TEXT NOT NULL DEFAULT 'global' CHECK (scope IN ('global','branch')),
  branch_id       UUID REFERENCES public.branches(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by      UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  UNIQUE (key, branch_id)
);
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.resource_status_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resource_id         UUID NOT NULL REFERENCES public.resources(id) ON DELETE CASCADE,
  from_status         TEXT,
  to_status           TEXT,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_staff_id UUID REFERENCES public.staff_users(id) ON DELETE SET NULL,
  until_at            TIMESTAMPTZ,
  reason              TEXT,
  auto_cleared        BOOLEAN NOT NULL DEFAULT false
);
ALTER TABLE public.resource_status_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_rsl_resource ON public.resource_status_log(resource_id, changed_at DESC);

-- ---------------------------------------------------------------------------
-- TRANSACTIONAL: reservations
-- ---------------------------------------------------------------------------
CREATE TABLE public.reservations (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_no              TEXT UNIQUE NOT NULL,
  branch_id                   UUID NOT NULL REFERENCES public.branches(id),
  source_type                 TEXT NOT NULL CHECK (source_type IN ('hotel_proxy','online_self','phone','walkin')),
  source_id                   UUID REFERENCES public.customer_sources(id),
  billing_to_id               UUID REFERENCES public.billing_destinations(id),
  created_by_staff_id         UUID REFERENCES public.staff_users(id),
  created_by_guest_email      TEXT,
  guest_name                  TEXT NOT NULL,
  guest_phone                 TEXT,
  pax                         INTEGER NOT NULL,
  gender_preference           TEXT,
  desired_service_start       TIMESTAMPTZ NOT NULL,
  desired_service_end         TIMESTAMPTZ NOT NULL,
  service_location_type       TEXT CHECK (service_location_type IN ('on_site','external_hotel')),
  external_room_no            TEXT,
  deposit_amount_cents        INTEGER NOT NULL DEFAULT 0,
  deposit_payment_id          UUID,
  status                      TEXT NOT NULL DEFAULT 'reserved'
                              CHECK (status IN ('reserved','confirmed','converted','cancelled','no_show')),
  note                        TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at                  TIMESTAMPTZ
);
CREATE TRIGGER trg_reservations_updated BEFORE UPDATE ON public.reservations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.reservations ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_reservations_date ON public.reservations(desired_service_start) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- TRANSACTIONAL: orders + order_customers + order_items
-- ---------------------------------------------------------------------------
CREATE TABLE public.orders (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no                    TEXT UNIQUE NOT NULL,
  branch_id                   UUID NOT NULL REFERENCES public.branches(id),
  reservation_id              UUID REFERENCES public.reservations(id),
  source_id                   UUID REFERENCES public.customer_sources(id),
  billing_to_id               UUID REFERENCES public.billing_destinations(id),
  stored_value_card_id        UUID,    -- FK added after stored_value_cards
  payment_method_id           UUID REFERENCES public.payment_methods(id),
  order_type                  TEXT NOT NULL DEFAULT 'walk_in'
                              CHECK (order_type IN ('walk_in','reservation','package_use','stored_value','external')),
  service_location_type       TEXT CHECK (service_location_type IN ('on_site','external_hotel')),
  external_hotel_id           UUID REFERENCES public.billing_destinations(id),
  business_unit               TEXT NOT NULL DEFAULT 'spa',
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('reserved','draft','open','in_service','completed','posting','paid','closed','void')),
  service_date                DATE NOT NULL,
  subtotal_cents              INTEGER NOT NULL DEFAULT 0,
  discount_cents              INTEGER NOT NULL DEFAULT 0,
  total_cents                 INTEGER NOT NULL DEFAULT 0,
  paid_cents                  INTEGER NOT NULL DEFAULT 0,
  note                        TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at                  TIMESTAMPTZ
);
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_orders_date_status ON public.orders(service_date, status) WHERE deleted_at IS NULL;

CREATE TABLE public.order_customers (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  customer_id                 UUID REFERENCES public.customers(id),
  customer_name               TEXT NOT NULL,
  customer_phone              TEXT,
  gender                      TEXT,
  email                       TEXT,
  seq_no                      INTEGER NOT NULL,
  discount_id_type            TEXT,
  discount_id_no              TEXT,
  discount_id_verified        BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_order_customers_updated BEFORE UPDATE ON public.order_customers
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.order_customers ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.order_items (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_customer_id           UUID NOT NULL REFERENCES public.order_customers(id) ON DELETE CASCADE,
  service_item_id             UUID NOT NULL REFERENCES public.service_items(id),
  service_category_id         UUID NOT NULL REFERENCES public.service_categories(id),
  therapist_id                UUID REFERENCES public.employees(id),
  therapist_home_branch_id    UUID REFERENCES public.branches(id),
  commission_branch_id        UUID REFERENCES public.branches(id),
  resource_id                 UUID REFERENCES public.resources(id),
  external_room_no            TEXT,
  scheduled_start             TIMESTAMPTZ,
  service_start               TIMESTAMPTZ,
  service_end                 TIMESTAMPTZ,
  actual_start                TIMESTAMPTZ,
  actual_end                  TIMESTAMPTZ,
  slot_start                  TIMESTAMPTZ,
  slot_end                    TIMESTAMPTZ,
  duration_minutes            INTEGER NOT NULL,
  list_price_cents            INTEGER NOT NULL,
  discount_class_id           UUID NOT NULL REFERENCES public.discount_classes(id),
  discount_amount_cents       INTEGER NOT NULL DEFAULT 0,
  final_amount_cents          INTEGER NOT NULL,
  commission_rate             NUMERIC(5,4),
  commission_amount_cents     INTEGER,
  item_seq                    INTEGER,
  commission_settlement_id    UUID,    -- FK added after commission_periods
  -- service interrupt
  interruption_reason         TEXT,
  interruption_at             TIMESTAMPTZ,
  interruption_handling       TEXT CHECK (interruption_handling IS NULL OR interruption_handling IN ('no_charge','partial_charge','full_charge','reschedule')),
  actual_duration_minutes     INTEGER,
  status                      TEXT NOT NULL DEFAULT 'scheduled'
                              CHECK (status IN ('scheduled','in_service','service_completed','interrupted','feedback_done')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_order_items_updated BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_order_items_therapist_date ON public.order_items(therapist_id, actual_start);

-- ---------------------------------------------------------------------------
-- TRANSACTIONAL: payments
-- ---------------------------------------------------------------------------
CREATE TABLE public.payments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id                    UUID REFERENCES public.orders(id) ON DELETE CASCADE,
  payment_method_id           UUID NOT NULL REFERENCES public.payment_methods(id),
  amount_cents                INTEGER NOT NULL,
  auth_code                   TEXT,
  card_last4                  TEXT,
  payment_ref                 TEXT,
  stored_value_card_id        UUID,    -- FK added later
  paid_at                     TIMESTAMPTZ NOT NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_payments_updated BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reservations
  ADD CONSTRAINT fk_res_deposit_payment FOREIGN KEY (deposit_payment_id) REFERENCES public.payments(id);

-- ---------------------------------------------------------------------------
-- TRANSACTIONAL: tips, feedback
-- ---------------------------------------------------------------------------
CREATE TABLE public.tips (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id       UUID NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  therapist_id        UUID NOT NULL REFERENCES public.employees(id),
  payment_id          UUID NOT NULL REFERENCES public.payments(id),
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  status              TEXT NOT NULL DEFAULT 'open'
                      CHECK (status IN ('open','posting','closed','failed')),
  settlement_id       UUID,    -- FK added after tip_settlements
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_tips_updated BEFORE UPDATE ON public.tips
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.tips ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tips_open ON public.tips(therapist_id, status) WHERE status = 'open';

CREATE TABLE public.feedback (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  order_item_id       UUID UNIQUE NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  therapist_id        UUID REFERENCES public.employees(id),
  status              TEXT NOT NULL CHECK (status IN ('filled','skipped')),
  skipped_reason      TEXT,
  score               SMALLINT CHECK (score BETWEEN 1 AND 10),
  age                 INTEGER,
  email               TEXT,
  comment             TEXT,
  filled_via          TEXT CHECK (filled_via IN ('tablet','qr','paper')),
  language            TEXT DEFAULT 'en',
  filled_at           TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_feedback_updated BEFORE UPDATE ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- STORED VALUE CARDS
-- ---------------------------------------------------------------------------
CREATE TABLE public.stored_value_cards (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_no                     TEXT UNIQUE NOT NULL,
  customer_id                 UUID NOT NULL REFERENCES public.customers(id),
  branch_id                   UUID NOT NULL REFERENCES public.branches(id),
  initial_amount_cents        INTEGER NOT NULL CHECK (initial_amount_cents > 0),
  bonus_amount_cents          INTEGER NOT NULL DEFAULT 0,
  current_balance_cents       INTEGER NOT NULL,
  discount_class_id           UUID REFERENCES public.discount_classes(id),
  issued_at                   TIMESTAMPTZ NOT NULL,
  expires_at                  TIMESTAMPTZ NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'active'
                              CHECK (status IN ('active','suspended','expired','refunded','depleted')),
  transferable                BOOLEAN NOT NULL DEFAULT false,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_svc_updated BEFORE UPDATE ON public.stored_value_cards
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.stored_value_cards ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders
  ADD CONSTRAINT fk_orders_svc FOREIGN KEY (stored_value_card_id) REFERENCES public.stored_value_cards(id);
ALTER TABLE public.payments
  ADD CONSTRAINT fk_payments_svc FOREIGN KEY (stored_value_card_id) REFERENCES public.stored_value_cards(id);

CREATE TABLE public.stored_value_transactions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id                     UUID NOT NULL REFERENCES public.stored_value_cards(id) ON DELETE CASCADE,
  type                        TEXT NOT NULL CHECK (type IN ('top_up','bonus_grant','consume','refund','freeze','unfreeze','adjustment','expire_forfeit')),
  amount_cents                INTEGER NOT NULL,
  balance_after_cents         INTEGER NOT NULL,
  related_order_id            UUID REFERENCES public.orders(id),
  related_payment_id          UUID REFERENCES public.payments(id),
  branch_id                   UUID NOT NULL REFERENCES public.branches(id),
  note                        TEXT,
  approved_by_user_id         UUID REFERENCES public.staff_users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.stored_value_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_svt_card ON public.stored_value_transactions(card_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- RECONCILIATION: cash, soa, tip settlement, commission period, adjustments
-- ---------------------------------------------------------------------------
CREATE TABLE public.cash_reconciliations (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                       UUID NOT NULL REFERENCES public.branches(id),
  reconciliation_date             DATE NOT NULL,
  shift_label                     TEXT NOT NULL,
  cashier_user_id                 UUID NOT NULL REFERENCES public.staff_users(id),
  shift_start_at                  TIMESTAMPTZ,
  shift_end_at                    TIMESTAMPTZ,
  system_cash_in_cents            INTEGER NOT NULL DEFAULT 0,
  system_cash_out_cents           INTEGER NOT NULL DEFAULT 0,
  system_expected_cents           INTEGER NOT NULL,
  opening_float_cents             INTEGER NOT NULL DEFAULT 0,
  previous_shift_handover_cents   INTEGER NOT NULL DEFAULT 0,
  closing_count_cents             INTEGER,
  actual_received_cents           INTEGER,
  variance_cents                  INTEGER,
  variance_reason                 TEXT,
  counted_by_staff_id             UUID REFERENCES public.staff_users(id),
  approved_by_staff_id            UUID REFERENCES public.staff_users(id),
  status                          TEXT NOT NULL DEFAULT 'open'
                                  CHECK (status IN ('open','counting','closed')),
  closed_at                       TIMESTAMPTZ,
  note                            TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (branch_id, reconciliation_date, shift_label, cashier_user_id)
);
CREATE TRIGGER trg_cash_rec_updated BEFORE UPDATE ON public.cash_reconciliations
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.cash_reconciliations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.revenue_soa (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_no                      TEXT UNIQUE NOT NULL,
  billing_to_id               UUID NOT NULL REFERENCES public.billing_destinations(id),
  settlement_type             TEXT,
  period_from                 DATE NOT NULL,
  period_to                   DATE NOT NULL,
  subtotal_cents              INTEGER NOT NULL,
  total_cents                 INTEGER NOT NULL,
  paid_cents                  INTEGER NOT NULL DEFAULT 0,
  outstanding_cents           INTEGER,
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','issued','acknowledged','partial_paid','settled','disputed','void','voided_adjusted_later')),
  issued_date                 DATE,
  due_date                    DATE,
  pdf_file_path               TEXT,
  note                        TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
CREATE TRIGGER trg_soa_updated BEFORE UPDATE ON public.revenue_soa
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.revenue_soa ENABLE ROW LEVEL SECURITY;
-- Prevent overlapping periods per billing destination (excluding void/voided_adjusted_later)
CREATE EXTENSION IF NOT EXISTS btree_gist;
ALTER TABLE public.revenue_soa ADD CONSTRAINT no_soa_period_overlap
  EXCLUDE USING gist (
    billing_to_id WITH =,
    daterange(period_from, period_to, '[]') WITH &&
  ) WHERE (status NOT IN ('void','voided_adjusted_later'));

CREATE TABLE public.revenue_soa_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_id              UUID NOT NULL REFERENCES public.revenue_soa(id) ON DELETE CASCADE,
  order_id            UUID UNIQUE NOT NULL REFERENCES public.orders(id),
  amount_cents        INTEGER NOT NULL,
  added_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.revenue_soa_orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.revenue_soa_payments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  soa_id              UUID NOT NULL REFERENCES public.revenue_soa(id) ON DELETE CASCADE,
  amount_cents        INTEGER NOT NULL,
  paid_at             TIMESTAMPTZ NOT NULL,
  payment_method      TEXT,
  reference_no        TEXT,
  note                TEXT,
  recorded_by         UUID REFERENCES public.staff_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.revenue_soa_payments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.soa_adjustments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_soa_id     UUID NOT NULL REFERENCES public.revenue_soa(id),
  new_soa_id          UUID REFERENCES public.revenue_soa(id),
  adjustment_month    DATE NOT NULL,
  original_month      DATE NOT NULL,
  amount_cents        INTEGER NOT NULL,
  reason              TEXT NOT NULL,
  approval_user_id    UUID REFERENCES public.staff_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.soa_adjustments ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.tip_settlements (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_no       TEXT UNIQUE NOT NULL,
  period_from         DATE NOT NULL,
  period_to           DATE NOT NULL,
  subtotal_cents      INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft'
                      CHECK (status IN ('draft','posting','posted','failed','void')),
  posted_at           TIMESTAMPTZ,
  note                TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_tip_settlement_updated BEFORE UPDATE ON public.tip_settlements
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.tip_settlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tip_settlements ADD CONSTRAINT no_tip_period_overlap
  EXCLUDE USING gist (
    daterange(period_from, period_to, '[]') WITH &&
  ) WHERE (status NOT IN ('void'));

ALTER TABLE public.tips
  ADD CONSTRAINT fk_tips_settlement FOREIGN KEY (settlement_id) REFERENCES public.tip_settlements(id);

CREATE TABLE public.commission_periods (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_no                   TEXT UNIQUE NOT NULL,
  period_from                 DATE NOT NULL,
  period_to                   DATE NOT NULL,
  branch_id                   UUID REFERENCES public.branches(id),
  status                      TEXT NOT NULL DEFAULT 'draft'
                              CHECK (status IN ('draft','closed','void')),
  total_sessions              INTEGER,
  total_gross_sales_cents     INTEGER,
  total_commission_cents      INTEGER,
  confirmed_at                TIMESTAMPTZ,
  confirmed_by_staff_id       UUID REFERENCES public.staff_users(id),
  export_file_path            TEXT,
  export_format               TEXT,
  note                        TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_commission_periods_updated BEFORE UPDATE ON public.commission_periods
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.commission_periods ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.commission_entries (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_id                       UUID NOT NULL REFERENCES public.commission_periods(id) ON DELETE CASCADE,
  therapist_id                    UUID NOT NULL REFERENCES public.employees(id),
  branch_id                       UUID NOT NULL REFERENCES public.branches(id),
  total_sessions                  INTEGER NOT NULL,
  total_gross_sales_cents         INTEGER NOT NULL,
  computed_commission_cents       INTEGER NOT NULL,
  adjustment_cents                INTEGER NOT NULL DEFAULT 0,
  adjustment_reason               TEXT,
  adjustment_by_staff_id          UUID REFERENCES public.staff_users(id),
  adjustment_at                   TIMESTAMPTZ,
  final_amount_cents              INTEGER NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (period_id, therapist_id, branch_id)
);
CREATE TRIGGER trg_commission_entries_updated BEFORE UPDATE ON public.commission_entries
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.commission_entries ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.order_items
  ADD CONSTRAINT fk_order_items_commission_period
  FOREIGN KEY (commission_settlement_id) REFERENCES public.commission_periods(id);

CREATE TABLE public.order_adjustments (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_order_id           UUID NOT NULL REFERENCES public.orders(id),
  adjustment_type             TEXT NOT NULL CHECK (adjustment_type IN ('full_reversal','partial_amount_change','metadata_only')),
  adjustment_month            DATE,
  original_month              DATE,
  amount_cents                INTEGER,
  reason                      TEXT NOT NULL,
  reversal_batch_nbr          TEXT,
  new_order_id                UUID REFERENCES public.orders(id),
  approved_by_user_id         UUID REFERENCES public.staff_users(id),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.order_adjustments ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- SYSTEM AUDIT LOGS
-- ---------------------------------------------------------------------------
CREATE TABLE public.order_edit_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  edited_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  edited_by_staff_id  UUID REFERENCES public.staff_users(id),
  edit_reason         TEXT NOT NULL,
  before_snapshot     JSONB NOT NULL,
  after_snapshot      JSONB NOT NULL,
  from_status         TEXT,
  to_status           TEXT
);
ALTER TABLE public.order_edit_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.order_status_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type         TEXT NOT NULL,
  entity_id           UUID NOT NULL,
  from_status         TEXT,
  to_status           TEXT,
  changed_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by_staff_id UUID REFERENCES public.staff_users(id),
  reason              TEXT
);
ALTER TABLE public.order_status_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_osl_entity ON public.order_status_log(entity_type, entity_id, changed_at DESC);

CREATE TABLE public.erp_posting_log (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type                 TEXT NOT NULL,
  entity_id                   UUID NOT NULL,
  payload                     JSONB NOT NULL,
  status                      TEXT NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','success','failed','unknown')),
  erp_response                JSONB,
  error_message               TEXT,
  batch_nbr                   TEXT,
  retried_count               INTEGER NOT NULL DEFAULT 0,
  posted_by_staff_id          UUID REFERENCES public.staff_users(id),
  posted_at_attempt           TIMESTAMPTZ NOT NULL DEFAULT now(),
  acu_session_user_id         TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.erp_posting_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_epl_entity ON public.erp_posting_log(entity_type, entity_id, posted_at_attempt DESC);

-- ---------------------------------------------------------------------------
-- ADDITIONAL MODULES (2026-05-19): incident, waitlist, help, eod report
-- ---------------------------------------------------------------------------
CREATE TABLE public.incident_log (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  related_order_id            UUID REFERENCES public.orders(id),
  related_order_item_id       UUID REFERENCES public.order_items(id),
  related_employee_id         UUID REFERENCES public.employees(id),
  customer_name               TEXT NOT NULL,
  customer_phone              TEXT,
  incident_type               TEXT NOT NULL CHECK (incident_type IN ('complaint','accident','equipment_failure','staff_issue','service_quality','other')),
  severity                    TEXT NOT NULL CHECK (severity IN ('low','medium','high')),
  description                 TEXT NOT NULL,
  resolution_action           TEXT,
  related_discount_id         UUID REFERENCES public.discount_classes(id),
  resolved                    BOOLEAN NOT NULL DEFAULT false,
  follow_up_required          BOOLEAN NOT NULL DEFAULT false,
  reported_by_staff_id        UUID REFERENCES public.staff_users(id),
  reported_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by_staff_id        UUID REFERENCES public.staff_users(id),
  resolved_at                 TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.incident_log ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.waitlist (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id                       UUID NOT NULL REFERENCES public.branches(id),
  customer_name                   TEXT NOT NULL,
  customer_phone                  TEXT,
  pax                             INTEGER NOT NULL,
  preferred_service_category_id   UUID REFERENCES public.service_categories(id),
  preferred_therapist_id          UUID REFERENCES public.employees(id),
  preferred_gender                TEXT,
  arrived_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  estimated_wait_minutes          INTEGER,
  notified_at                     TIMESTAMPTZ,
  status                          TEXT NOT NULL DEFAULT 'waiting'
                                  CHECK (status IN ('waiting','notified','seated','cancelled','walked_away')),
  position                        INTEGER,
  converted_to_order_id           UUID REFERENCES public.orders(id),
  note                            TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_waitlist_updated BEFORE UPDATE ON public.waitlist
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.help_articles (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT UNIQUE NOT NULL,
  title               TEXT NOT NULL,
  category            TEXT NOT NULL CHECK (category IN ('getting_started','daily_ops','reconciliation','master_data','troubleshooting','api_integration')),
  content_markdown    TEXT NOT NULL,
  order_index         INTEGER NOT NULL DEFAULT 0,
  is_published        BOOLEAN NOT NULL DEFAULT true,
  applies_to_roles    TEXT[],
  contextual_pages    TEXT[],
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by_staff_id UUID REFERENCES public.staff_users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_help_articles_updated BEFORE UPDATE ON public.help_articles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.help_articles ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.help_article_versions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id                  UUID NOT NULL REFERENCES public.help_articles(id) ON DELETE CASCADE,
  version_no                  INTEGER NOT NULL,
  content_markdown_snapshot   TEXT NOT NULL,
  edited_by_staff_id          UUID REFERENCES public.staff_users(id),
  edited_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  change_summary              TEXT
);
ALTER TABLE public.help_article_versions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.eod_report_config (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID NOT NULL REFERENCES public.branches(id) UNIQUE,
  enabled             BOOLEAN NOT NULL DEFAULT true,
  recipients          TEXT[],
  send_time           TIME NOT NULL DEFAULT '08:00',
  include_sections    TEXT[],
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER trg_eod_config_updated BEFORE UPDATE ON public.eod_report_config
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
ALTER TABLE public.eod_report_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.eod_report_log (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  branch_id           UUID NOT NULL REFERENCES public.branches(id),
  sent_for_date       DATE NOT NULL,
  sent_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  recipients          TEXT[],
  status              TEXT NOT NULL CHECK (status IN ('sent','failed','partial')),
  pdf_attachment_path TEXT,
  error_message       TEXT,
  UNIQUE (branch_id, sent_for_date)
);
ALTER TABLE public.eod_report_log ENABLE ROW LEVEL SECURITY;

-- ===========================================================================
-- End of initial schema. Subsequent migrations add seed data, RLS policies,
-- additional features, etc.
-- ===========================================================================
