-- Phase 13: FM Cleaning Scheduler

ALTER TABLE public.employees ADD COLUMN auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX idx_employees_auth_user_id ON public.employees(auth_user_id) WHERE auth_user_id IS NOT NULL;

ALTER TABLE public.fm_cleaning_floors ADD COLUMN nfc_token uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX idx_fm_cleaning_floors_nfc_token ON public.fm_cleaning_floors(nfc_token);

CREATE TABLE public.fm_cleaning_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES public.fm_cleaning_floors(id) ON DELETE CASCADE,
  area_type text NOT NULL CHECK (area_type IN ('section', 'utility_room')),
  frequency_type text NOT NULL CHECK (frequency_type IN ('daily', 'weekly', 'custom_days')),
  days_of_week integer[],
  time_window_start time without time zone,
  time_window_end time without time zone,
  assigned_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_schedules TO authenticated;
GRANT ALL ON public.fm_cleaning_schedules TO service_role;
ALTER TABLE public.fm_cleaning_schedules ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_cleaning_schedules_select ON public.fm_cleaning_schedules FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'projects', 'view'));
CREATE POLICY fm_cleaning_schedules_insert ON public.fm_cleaning_schedules FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'projects', 'add'));
CREATE POLICY fm_cleaning_schedules_update ON public.fm_cleaning_schedules FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'projects', 'edit'));
CREATE POLICY fm_cleaning_schedules_delete ON public.fm_cleaning_schedules FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'delete'));
CREATE INDEX idx_fm_cleaning_schedules_floor ON public.fm_cleaning_schedules(floor_id);
CREATE TRIGGER fm_cleaning_schedules_updated_at BEFORE UPDATE ON public.fm_cleaning_schedules FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_cleaning_schedules AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_schedules FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TABLE public.fm_cleaning_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id uuid NOT NULL REFERENCES public.fm_cleaning_floors(id) ON DELETE CASCADE,
  tower_id uuid NOT NULL REFERENCES public.fm_cleaning_towers(id) ON DELETE CASCADE,
  performed_by_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  scanned_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_visits TO authenticated;
GRANT ALL ON public.fm_cleaning_visits TO service_role;
ALTER TABLE public.fm_cleaning_visits ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_cleaning_visits_select ON public.fm_cleaning_visits FOR SELECT TO authenticated USING (
  app_private.can(auth.uid(), 'projects', 'view')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = performed_by_employee_id AND e.auth_user_id = auth.uid())
);
CREATE POLICY fm_cleaning_visits_insert ON public.fm_cleaning_visits FOR INSERT TO authenticated WITH CHECK (
  app_private.can(auth.uid(), 'projects', 'add')
  OR EXISTS (SELECT 1 FROM public.employees e WHERE e.id = performed_by_employee_id AND e.auth_user_id = auth.uid())
);
CREATE POLICY fm_cleaning_visits_update ON public.fm_cleaning_visits FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'projects', 'edit'));
CREATE POLICY fm_cleaning_visits_delete ON public.fm_cleaning_visits FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'delete'));
CREATE INDEX idx_fm_cleaning_visits_floor ON public.fm_cleaning_visits(floor_id);
CREATE INDEX idx_fm_cleaning_visits_tower ON public.fm_cleaning_visits(tower_id);
CREATE INDEX idx_fm_cleaning_visits_employee ON public.fm_cleaning_visits(performed_by_employee_id);
CREATE TRIGGER audit_fm_cleaning_visits AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_visits FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TABLE public.fm_cleaning_visit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  visit_id uuid NOT NULL REFERENCES public.fm_cleaning_visits(id) ON DELETE CASCADE,
  area_id uuid REFERENCES public.fm_cleaning_areas(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'done' CHECK (status IN ('done', 'skipped', 'issue')),
  note text,
  photo_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_visit_items TO authenticated;
GRANT ALL ON public.fm_cleaning_visit_items TO service_role;
ALTER TABLE public.fm_cleaning_visit_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_cleaning_visit_items_select ON public.fm_cleaning_visit_items FOR SELECT TO authenticated USING (
  app_private.can(auth.uid(), 'projects', 'view')
  OR EXISTS (
    SELECT 1 FROM public.fm_cleaning_visits v JOIN public.employees e ON e.id = v.performed_by_employee_id
    WHERE v.id = visit_id AND e.auth_user_id = auth.uid()
  )
);
CREATE POLICY fm_cleaning_visit_items_insert ON public.fm_cleaning_visit_items FOR INSERT TO authenticated WITH CHECK (
  app_private.can(auth.uid(), 'projects', 'add')
  OR EXISTS (
    SELECT 1 FROM public.fm_cleaning_visits v JOIN public.employees e ON e.id = v.performed_by_employee_id
    WHERE v.id = visit_id AND e.auth_user_id = auth.uid()
  )
);
CREATE POLICY fm_cleaning_visit_items_update ON public.fm_cleaning_visit_items FOR UPDATE TO authenticated USING (
  app_private.can(auth.uid(), 'projects', 'edit')
  OR EXISTS (
    SELECT 1 FROM public.fm_cleaning_visits v JOIN public.employees e ON e.id = v.performed_by_employee_id
    WHERE v.id = visit_id AND e.auth_user_id = auth.uid()
  )
) WITH CHECK (
  app_private.can(auth.uid(), 'projects', 'edit')
  OR EXISTS (
    SELECT 1 FROM public.fm_cleaning_visits v JOIN public.employees e ON e.id = v.performed_by_employee_id
    WHERE v.id = visit_id AND e.auth_user_id = auth.uid()
  )
);
CREATE POLICY fm_cleaning_visit_items_delete ON public.fm_cleaning_visit_items FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'delete'));
CREATE INDEX idx_fm_cleaning_visit_items_visit ON public.fm_cleaning_visit_items(visit_id);
CREATE INDEX idx_fm_cleaning_visit_items_area ON public.fm_cleaning_visit_items(area_id);
CREATE TRIGGER audit_fm_cleaning_visit_items AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_visit_items FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();