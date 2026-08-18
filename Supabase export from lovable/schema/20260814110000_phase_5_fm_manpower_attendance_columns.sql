-- Phase 5: Manpower planning and attendance compatibility columns.
-- Additive only; preserves Phase 1 table shape and existing consumers.

ALTER TABLE public.contract_manpower_plans
  ADD COLUMN IF NOT EXISTS service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS shift_start time,
  ADD COLUMN IF NOT EXISTS shift_end time,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.contract_manpower_assignments
  ADD COLUMN IF NOT EXISTS designation text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.attendance_logs
  ADD COLUMN IF NOT EXISTS shift text;

UPDATE public.contract_manpower_plans
SET remarks = COALESCE(remarks, notes)
WHERE remarks IS NULL AND notes IS NOT NULL;

UPDATE public.contract_manpower_assignments
SET
  remarks = COALESCE(remarks, notes),
  active = CASE WHEN status = 'Inactive' THEN false ELSE active END
WHERE remarks IS NULL OR status = 'Inactive';

UPDATE public.attendance_logs
SET shift = COALESCE(shift, shift_name)
WHERE shift IS NULL AND shift_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_manpower_plans_category ON public.contract_manpower_plans(service_category_id);
CREATE INDEX IF NOT EXISTS idx_manpower_plans_active ON public.contract_manpower_plans(active);
CREATE INDEX IF NOT EXISTS idx_manpower_assignments_employee ON public.contract_manpower_assignments(employee_id);
CREATE INDEX IF NOT EXISTS idx_manpower_assignments_active ON public.contract_manpower_assignments(active);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_date ON public.attendance_logs(employee_id, attendance_date);
