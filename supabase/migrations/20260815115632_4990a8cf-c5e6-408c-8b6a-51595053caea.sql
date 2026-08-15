CREATE TABLE public.fm_daily_cleaning_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fm_contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  check_date date NOT NULL DEFAULT CURRENT_DATE,
  area text,
  task_name text NOT NULL,
  status text NOT NULL DEFAULT 'Pending',
  remarks text,
  checked_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fm_contract_id, check_date, task_name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_daily_cleaning_checks TO authenticated;
GRANT ALL ON public.fm_daily_cleaning_checks TO service_role;

ALTER TABLE public.fm_daily_cleaning_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view cleaning checks"
  ON public.fm_daily_cleaning_checks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert cleaning checks"
  ON public.fm_daily_cleaning_checks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update cleaning checks"
  ON public.fm_daily_cleaning_checks FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete cleaning checks"
  ON public.fm_daily_cleaning_checks FOR DELETE TO authenticated USING (true);

CREATE INDEX fm_daily_cleaning_checks_contract_date_idx
  ON public.fm_daily_cleaning_checks (fm_contract_id, check_date);

CREATE TRIGGER fm_daily_cleaning_checks_updated_at
  BEFORE UPDATE ON public.fm_daily_cleaning_checks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_fm_daily_cleaning_checks
  AFTER INSERT OR UPDATE OR DELETE ON public.fm_daily_cleaning_checks
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();