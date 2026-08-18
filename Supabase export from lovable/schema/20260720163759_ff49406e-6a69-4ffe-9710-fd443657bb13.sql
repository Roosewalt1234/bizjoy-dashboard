ALTER TABLE public.sales_leads ADD COLUMN lead_type text;
ALTER TABLE public.quotes ADD COLUMN quote_type text;

ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anonymous access" ON public.sales_leads;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.quotes;

CREATE POLICY "Allow anonymous access" ON public.sales_leads FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow anonymous access" ON public.quotes FOR ALL USING (true) WITH CHECK (true);

GRANT ALL ON public.sales_leads TO service_role;
GRANT ALL ON public.quotes TO service_role;