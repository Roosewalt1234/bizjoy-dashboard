
CREATE TABLE public.sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_name TEXT NOT NULL,
  company TEXT,
  email TEXT,
  phone TEXT,
  stage TEXT NOT NULL DEFAULT 'New Lead / Inquiry',
  source TEXT,
  estimated_value NUMERIC,
  currency TEXT DEFAULT 'AED',
  expected_close_date DATE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  salesperson TEXT,
  notes TEXT,
  position INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales_leads TO anon, authenticated;
GRANT ALL ON public.sales_leads TO service_role;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access sales_leads" ON public.sales_leads FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER sales_leads_updated_at BEFORE UPDATE ON public.sales_leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  zoho_quote_id TEXT UNIQUE,
  quote_number TEXT,
  quote_date DATE,
  expiry_date DATE,
  customer_name TEXT,
  zoho_customer_id TEXT,
  status TEXT,
  currency TEXT,
  subtotal NUMERIC,
  total NUMERIC,
  subject TEXT,
  salesperson TEXT,
  project_name TEXT,
  purchase_order TEXT,
  notes TEXT,
  terms TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quotes TO anon, authenticated;
GRANT ALL ON public.quotes TO service_role;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public access quotes" ON public.quotes FOR ALL USING (true) WITH CHECK (true);
CREATE TRIGGER quotes_updated_at BEFORE UPDATE ON public.quotes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
