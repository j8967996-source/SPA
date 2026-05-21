-- Per-therapist skill set at the service-group level (e.g. "Thai Massage",
-- "Filipino Traditional"). Not every therapist performs every service; this
-- drives the order therapist picker / auto-assign. Skills are global (not per
-- branch), matching the single-master design.
CREATE TABLE public.employee_service_groups (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  service_group TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (employee_id, service_group)
);
CREATE INDEX idx_esg_employee ON public.employee_service_groups(employee_id);
CREATE INDEX idx_esg_group ON public.employee_service_groups(service_group);
ALTER TABLE public.employee_service_groups ENABLE ROW LEVEL SECURITY;
