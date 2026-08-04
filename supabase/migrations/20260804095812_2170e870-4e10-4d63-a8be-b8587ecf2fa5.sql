ALTER TABLE public.service_reports ADD COLUMN IF NOT EXISTS handyman_hours numeric;

CREATE TABLE public.handyman_hours_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  report_id uuid REFERENCES public.service_reports(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id),
  customer_name text,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  hours numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.handyman_hours_log TO authenticated;
GRANT ALL ON public.handyman_hours_log TO service_role;

ALTER TABLE public.handyman_hours_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view handyman hours" ON public.handyman_hours_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert handyman hours" ON public.handyman_hours_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update handyman hours" ON public.handyman_hours_log FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete handyman hours" ON public.handyman_hours_log FOR DELETE TO authenticated USING (true);

CREATE INDEX idx_handyman_hours_log_contract ON public.handyman_hours_log(contract_id);
CREATE UNIQUE INDEX idx_handyman_hours_log_report ON public.handyman_hours_log(report_id) WHERE report_id IS NOT NULL;

CREATE TRIGGER handyman_hours_log_updated_at BEFORE UPDATE ON public.handyman_hours_log FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_handyman_hours_log AFTER INSERT OR UPDATE OR DELETE ON public.handyman_hours_log FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();