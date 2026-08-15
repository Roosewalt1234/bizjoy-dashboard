CREATE TABLE IF NOT EXISTS public.contract_consumables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  category text,
  item_name text NOT NULL,
  monthly_amount numeric DEFAULT 0,
  annual_amount numeric DEFAULT 0,
  included boolean NOT NULL DEFAULT true,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_consumables TO authenticated;
GRANT ALL ON public.contract_consumables TO service_role;
ALTER TABLE public.contract_consumables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read contract_consumables" ON public.contract_consumables FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert contract_consumables" ON public.contract_consumables FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update contract_consumables" ON public.contract_consumables FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete contract_consumables" ON public.contract_consumables FOR DELETE TO authenticated USING (true);
CREATE TRIGGER contract_consumables_updated_at BEFORE UPDATE ON public.contract_consumables FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_contract_consumables_contract ON public.contract_consumables(contract_id);

CREATE TABLE IF NOT EXISTS public.contract_billing_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_category_id uuid REFERENCES public.service_categories(id),
  billing_line text NOT NULL,
  monthly_amount numeric DEFAULT 0,
  annual_amount numeric DEFAULT 0,
  vat_status text,
  notes text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_billing_lines TO authenticated;
GRANT ALL ON public.contract_billing_lines TO service_role;
ALTER TABLE public.contract_billing_lines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth read contract_billing_lines" ON public.contract_billing_lines FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert contract_billing_lines" ON public.contract_billing_lines FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth update contract_billing_lines" ON public.contract_billing_lines FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth delete contract_billing_lines" ON public.contract_billing_lines FOR DELETE TO authenticated USING (true);
CREATE TRIGGER contract_billing_lines_updated_at BEFORE UPDATE ON public.contract_billing_lines FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX IF NOT EXISTS idx_contract_billing_lines_contract ON public.contract_billing_lines(contract_id);