
CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','customer_contacts','employees','accounts_transactions',
    'contracts','quotes','quote_items','sales_orders','sales_leads',
    'projects','customer_documents'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', 'Admins manage ' || t, t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (app_private.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (app_private.has_role(auth.uid(), ''admin''::app_role))',
      'Admins manage ' || t, t
    );
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Admins view remarks" ON public.followup_remarks;
CREATE POLICY "Admins view remarks" ON public.followup_remarks FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Storage
DROP POLICY IF EXISTS "Admins read customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins insert customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins update customer-documents" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete customer-documents" ON storage.objects;
CREATE POLICY "Admins read customer-documents" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'customer-documents' AND app_private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert customer-documents" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'customer-documents' AND app_private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update customer-documents" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'customer-documents' AND app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'customer-documents' AND app_private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete customer-documents" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'customer-documents' AND app_private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins read employee-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins insert employee-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins update employee-images" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete employee-images" ON storage.objects;
CREATE POLICY "Admins read employee-images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-images' AND app_private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins insert employee-images" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-images' AND app_private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins update employee-images" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-images' AND app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (bucket_id = 'employee-images' AND app_private.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins delete employee-images" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-images' AND app_private.has_role(auth.uid(), 'admin'::app_role));

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
