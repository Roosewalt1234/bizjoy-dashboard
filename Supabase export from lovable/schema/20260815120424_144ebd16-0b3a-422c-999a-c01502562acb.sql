CREATE TABLE IF NOT EXISTS public.fm_cleaning_checklist_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fm_contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  area text,
  task_name text NOT NULL,
  default_priority text NOT NULL DEFAULT 'Medium',
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fm_contract_id, task_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_cleaning_checklist_templates TO authenticated;
GRANT ALL ON public.fm_cleaning_checklist_templates TO service_role;

ALTER TABLE public.fm_cleaning_checklist_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cleaning templates"
  ON public.fm_cleaning_checklist_templates FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cleaning templates"
  ON public.fm_cleaning_checklist_templates FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update cleaning templates"
  ON public.fm_cleaning_checklist_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete cleaning templates"
  ON public.fm_cleaning_checklist_templates FOR DELETE TO authenticated USING (true);

CREATE TRIGGER set_fm_cleaning_checklist_templates_updated_at
  BEFORE UPDATE ON public.fm_cleaning_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_fm_cleaning_checklist_templates
  AFTER INSERT OR UPDATE OR DELETE ON public.fm_cleaning_checklist_templates
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

INSERT INTO public.fm_cleaning_checklist_templates (fm_contract_id, area, task_name, default_priority, sort_order)
SELECT c.id, v.area, v.task_name, 'Medium', v.sort_order
FROM public.contracts c
CROSS JOIN (VALUES
  ('Common Areas', 'Lobby cleaned', 1),
  ('Common Areas', 'Corridors cleaned', 2),
  ('Common Areas', 'Lifts cleaned', 3),
  ('External', 'Parking area cleaned', 4),
  ('Waste', 'Garbage room cleaned', 5),
  ('Amenities', 'Gym / washroom / common areas checked', 6),
  ('Materials', 'Chemicals / tools available', 7),
  ('Materials', 'Air fresheners / water checked', 8)
) AS v(area, task_name, sort_order)
WHERE c.module_type = 'FM' AND c.title = '48 Parkside'
ON CONFLICT (fm_contract_id, task_name) DO NOTHING;