-- Shift Schedule gains an optional station/bed assignment so the weekly grid can
-- be pivoted two ways: by therapist (existing) and by station (new). A shift may
-- be left unassigned (therapist floats) — resource_id is nullable. ON DELETE SET
-- NULL keeps shifts intact if a station is later removed.
ALTER TABLE public.employee_shifts
  ADD COLUMN resource_id UUID REFERENCES public.resources(id) ON DELETE SET NULL;

CREATE INDEX idx_shifts_resource_date ON public.employee_shifts(resource_id, shift_date);
