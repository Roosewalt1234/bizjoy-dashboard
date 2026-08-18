
DO $$
DECLARE
  t text;
  tables text[] := ARRAY['accounts_transactions','contracts','customer_contacts','customer_documents','customers','employees','projects','quote_items','quotes','sales_leads','sales_orders'];
  polname text;
BEGIN
  FOREACH t IN ARRAY tables LOOP
    polname := 'Authenticated manage ' || t;
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', polname, t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)', polname, t);
  END LOOP;
END $$;
