
-- 1. Sensitive tables: admin-only access
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','customer_contacts','employees','accounts_transactions',
    'contracts','quotes','quote_items','sales_orders','sales_leads',
    'projects','customer_documents'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Authenticated manage ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))',
      'Admins manage ' || t, t
    );
  END LOOP;
END $$;

-- 2. followup_remarks: SELECT admin-only
DROP POLICY IF EXISTS "Authenticated can view remarks" ON public.followup_remarks;
CREATE POLICY "Admins view remarks"
  ON public.followup_remarks
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- 3. Storage buckets: admin-only access
DROP POLICY IF EXISTS "Authenticated read customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated insert customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated update customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated delete customer-documents" ON storage.objects;

CREATE POLICY "Admins read customer-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'customer-documents' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert customer-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-documents' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update customer-documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'customer-documents' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'customer-documents' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete customer-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customer-documents' AND public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Auth read employee images" ON storage.objects;
DROP POLICY IF EXISTS "Auth insert employee images" ON storage.objects;
DROP POLICY IF EXISTS "Auth update employee images" ON storage.objects;
DROP POLICY IF EXISTS "Auth delete employee images" ON storage.objects;

CREATE POLICY "Admins read employee-images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-images' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert employee-images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-images' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update employee-images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-images' AND public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'employee-images' AND public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete employee-images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-images' AND public.has_role(auth.uid(), 'admin'::app_role));

-- 4. Revoke direct EXECUTE on trigger-only SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
