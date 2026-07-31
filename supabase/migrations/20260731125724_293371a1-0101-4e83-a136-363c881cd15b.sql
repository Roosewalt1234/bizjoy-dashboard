CREATE TABLE IF NOT EXISTS public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module text NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_add boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_permissions TO authenticated;
GRANT ALL ON public.user_permissions TO service_role;

ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage user_permissions" ON public.user_permissions;
CREATE POLICY "Admins manage user_permissions" ON public.user_permissions
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Users view own permissions" ON public.user_permissions;
CREATE POLICY "Users view own permissions" ON public.user_permissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS set_user_permissions_updated_at ON public.user_permissions;
CREATE TRIGGER set_user_permissions_updated_at
  BEFORE UPDATE ON public.user_permissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION app_private.can(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT app_private.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.user_permissions up
      WHERE up.user_id = _user_id
        AND up.module = _module
        AND CASE _action
              WHEN 'view' THEN up.can_view
              WHEN 'add' THEN up.can_add
              WHEN 'edit' THEN up.can_edit
              WHEN 'delete' THEN up.can_delete
              ELSE false
            END
    );
$$;

REVOKE ALL ON FUNCTION app_private.can(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.can(uuid, text, text) TO authenticated, service_role;

-- Public wrapper so the app can check its own permissions
CREATE OR REPLACE FUNCTION public.my_permission(_module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$ SELECT app_private.can(auth.uid(), _module, _action); $$;

REVOKE ALL ON FUNCTION public.my_permission(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_permission(text, text) TO authenticated;

DO $$
DECLARE
  t record;
  m text;
  pol record;
  mapping jsonb := '{
    "customers":"customers",
    "customer_contacts":"customers",
    "customer_documents":"customers",
    "sales_leads":"sales",
    "quotes":"sales",
    "quote_items":"sales",
    "sales_orders":"sales",
    "employees":"hr",
    "accounts_transactions":"accounts",
    "contracts":"contracts",
    "contract_payments":"contracts",
    "projects":"projects"
  }'::jsonb;
BEGIN
  FOR t IN SELECT key AS tbl, value #>> '{}' AS mod FROM jsonb_each(mapping) LOOP
    m := t.mod;
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t.tbl LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t.tbl);
    END LOOP;

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app_private.can(auth.uid(), %L, ''view''))', t.tbl||'_select', t.tbl, m);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), %L, ''add''))', t.tbl||'_insert', t.tbl, m);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), %L, ''edit'')) WITH CHECK (app_private.can(auth.uid(), %L, ''edit''))', t.tbl||'_update', t.tbl, m, m);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (app_private.can(auth.uid(), %L, ''delete''))', t.tbl||'_delete', t.tbl, m);
  END LOOP;
END $$;