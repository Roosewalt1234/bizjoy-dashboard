-- Phase 12: FM Cleaning Areas - tower / floor / area hierarchy for defining
-- cleaning spaces (sections + utility rooms) per FM contract/project.

CREATE TABLE public.fm_cleaning_area_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  area_type text NOT NULL CHECK (area_type IN ('section', 'utility_room')),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_area_catalog TO authenticated;
GRANT ALL ON public.fm_cleaning_area_catalog TO service_role;
ALTER TABLE public.fm_cleaning_area_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_cleaning_area_catalog_select ON public.fm_cleaning_area_catalog FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'projects', 'view'));
CREATE POLICY fm_cleaning_area_catalog_insert ON public.fm_cleaning_area_catalog FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'projects', 'add'));
CREATE POLICY fm_cleaning_area_catalog_update ON public.fm_cleaning_area_catalog FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'projects', 'edit'));
CREATE POLICY fm_cleaning_area_catalog_delete ON public.fm_cleaning_area_catalog FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'delete'));
CREATE TRIGGER fm_cleaning_area_catalog_updated_at BEFORE UPDATE ON public.fm_cleaning_area_catalog FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_cleaning_area_catalog AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_area_catalog FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

INSERT INTO public.fm_cleaning_area_catalog (name, area_type, sort_order) VALUES
  ('Left Section', 'section', 1),
  ('Right Section', 'section', 2),
  ('Center Section', 'section', 3),
  ('Dustbin Chute Room', 'utility_room', 10),
  ('Electrical Meter Room', 'utility_room', 11),
  ('Water Meter Room', 'utility_room', 12),
  ('Fire Extinguisher Room', 'utility_room', 13),
  ('Staircase', 'utility_room', 14);

CREATE TABLE public.fm_cleaning_towers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.fm_contracts(id) ON DELETE CASCADE,
  name text NOT NULL,
  floor_count integer NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_towers TO authenticated;
GRANT ALL ON public.fm_cleaning_towers TO service_role;
ALTER TABLE public.fm_cleaning_towers ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_cleaning_towers_select ON public.fm_cleaning_towers FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'projects', 'view'));
CREATE POLICY fm_cleaning_towers_insert ON public.fm_cleaning_towers FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'projects', 'add'));
CREATE POLICY fm_cleaning_towers_update ON public.fm_cleaning_towers FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'projects', 'edit'));
CREATE POLICY fm_cleaning_towers_delete ON public.fm_cleaning_towers FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'delete'));
CREATE INDEX idx_fm_cleaning_towers_contract ON public.fm_cleaning_towers(contract_id);
CREATE TRIGGER fm_cleaning_towers_updated_at BEFORE UPDATE ON public.fm_cleaning_towers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_cleaning_towers AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_towers FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TABLE public.fm_cleaning_floors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tower_id uuid NOT NULL REFERENCES public.fm_cleaning_towers(id) ON DELETE CASCADE,
  label text NOT NULL,
  floor_number integer,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_floors TO authenticated;
GRANT ALL ON public.fm_cleaning_floors TO service_role;
ALTER TABLE public.fm_cleaning_floors ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_cleaning_floors_select ON public.fm_cleaning_floors FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'projects', 'view'));
CREATE POLICY fm_cleaning_floors_insert ON public.fm_cleaning_floors FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'projects', 'add'));
CREATE POLICY fm_cleaning_floors_update ON public.fm_cleaning_floors FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'projects', 'edit'));
CREATE POLICY fm_cleaning_floors_delete ON public.fm_cleaning_floors FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'delete'));
CREATE INDEX idx_fm_cleaning_floors_tower ON public.fm_cleaning_floors(tower_id);
CREATE TRIGGER fm_cleaning_floors_updated_at BEFORE UPDATE ON public.fm_cleaning_floors FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_cleaning_floors AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_floors FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TABLE public.fm_cleaning_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tower_id uuid NOT NULL REFERENCES public.fm_cleaning_towers(id) ON DELETE CASCADE,
  floor_id uuid REFERENCES public.fm_cleaning_floors(id) ON DELETE CASCADE,
  catalog_id uuid REFERENCES public.fm_cleaning_area_catalog(id) ON DELETE SET NULL,
  area_type text NOT NULL CHECK (area_type IN ('section', 'utility_room')),
  name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  notes text,
  nfc_token uuid DEFAULT gen_random_uuid(),
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_areas TO authenticated;
GRANT ALL ON public.fm_cleaning_areas TO service_role;
ALTER TABLE public.fm_cleaning_areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_cleaning_areas_select ON public.fm_cleaning_areas FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'projects', 'view'));
CREATE POLICY fm_cleaning_areas_insert ON public.fm_cleaning_areas FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'projects', 'add'));
CREATE POLICY fm_cleaning_areas_update ON public.fm_cleaning_areas FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'projects', 'edit'));
CREATE POLICY fm_cleaning_areas_delete ON public.fm_cleaning_areas FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'projects', 'delete'));
CREATE INDEX idx_fm_cleaning_areas_tower ON public.fm_cleaning_areas(tower_id);
CREATE INDEX idx_fm_cleaning_areas_floor ON public.fm_cleaning_areas(floor_id);
CREATE UNIQUE INDEX idx_fm_cleaning_areas_nfc_token ON public.fm_cleaning_areas(nfc_token);
CREATE TRIGGER fm_cleaning_areas_updated_at BEFORE UPDATE ON public.fm_cleaning_areas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_cleaning_areas AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_areas FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();