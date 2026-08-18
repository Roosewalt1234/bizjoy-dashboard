
-- Drop all permissive policies
DROP POLICY IF EXISTS "Open access accounts" ON public.accounts_transactions;
DROP POLICY IF EXISTS "Open access contracts" ON public.contracts;
DROP POLICY IF EXISTS "Open access contacts" ON public.customer_contacts;
DROP POLICY IF EXISTS "Open access documents" ON public.customer_documents;
DROP POLICY IF EXISTS "Open access customers" ON public.customers;
DROP POLICY IF EXISTS "Open access employees" ON public.employees;
DROP POLICY IF EXISTS "Open access projects" ON public.projects;
DROP POLICY IF EXISTS "Public access quote_items" ON public.quote_items;
DROP POLICY IF EXISTS "Public access quotes" ON public.quotes;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.quotes;
DROP POLICY IF EXISTS "Public access sales_leads" ON public.sales_leads;
DROP POLICY IF EXISTS "Allow anonymous access" ON public.sales_leads;
DROP POLICY IF EXISTS "Open access sales" ON public.sales_orders;

-- Revoke anon grants; keep authenticated + service_role
REVOKE ALL ON public.accounts_transactions, public.contracts, public.customer_contacts,
  public.customer_documents, public.customers, public.employees, public.projects,
  public.quote_items, public.quotes, public.sales_leads, public.sales_orders FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.accounts_transactions, public.contracts, public.customer_contacts,
  public.customer_documents, public.customers, public.employees, public.projects,
  public.quote_items, public.quotes, public.sales_leads, public.sales_orders
  TO authenticated;

GRANT ALL ON
  public.accounts_transactions, public.contracts, public.customer_contacts,
  public.customer_documents, public.customers, public.employees, public.projects,
  public.quote_items, public.quotes, public.sales_leads, public.sales_orders
  TO service_role;

-- Authenticated-only policies
CREATE POLICY "Authenticated manage accounts" ON public.accounts_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage contracts" ON public.contracts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage customer_contacts" ON public.customer_contacts FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage customer_documents" ON public.customer_documents FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage customers" ON public.customers FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage employees" ON public.employees FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage projects" ON public.projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage quote_items" ON public.quote_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage quotes" ON public.quotes FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage sales_leads" ON public.sales_leads FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated manage sales_orders" ON public.sales_orders FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Storage bucket: restrict to authenticated
DROP POLICY IF EXISTS "Anyone read customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone insert customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone update customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone delete customer-documents" ON storage.objects;

CREATE POLICY "Authenticated read customer-documents" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'customer-documents');
CREATE POLICY "Authenticated insert customer-documents" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'customer-documents');
CREATE POLICY "Authenticated update customer-documents" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'customer-documents') WITH CHECK (bucket_id = 'customer-documents');
CREATE POLICY "Authenticated delete customer-documents" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'customer-documents');
