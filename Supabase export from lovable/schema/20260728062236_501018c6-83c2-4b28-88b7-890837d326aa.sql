
-- Audit log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL,
  user_id uuid,
  user_name text,
  user_email text,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_table_name_idx ON public.audit_log(table_name);
CREATE INDEX audit_log_changed_at_idx ON public.audit_log(changed_at DESC);
CREATE INDEX audit_log_user_id_idx ON public.audit_log(user_id);
CREATE INDEX audit_log_record_id_idx ON public.audit_log(record_id);

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins view audit log" ON public.audit_log
  FOR SELECT TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'::app_role));

-- Trigger function
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_name text;
  v_email text;
  v_record_id uuid;
  v_old jsonb;
  v_new jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT display_name, email INTO v_name, v_email FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_record_id := (v_old->>'id')::uuid;
  ELSIF TG_OP = 'UPDATE' THEN
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::uuid;
  ELSE
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::uuid;
  END IF;

  INSERT INTO public.audit_log(table_name, record_id, action, user_id, user_name, user_email, old_data, new_data)
  VALUES (TG_TABLE_NAME, v_record_id, TG_OP, v_user_id, v_name, v_email, v_old, v_new);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Attach triggers to business tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'customers','contracts','contract_payments','quotes','quote_items',
    'sales_leads','sales_orders','employees','accounts_transactions',
    'customer_contacts','customer_documents','projects'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_%I ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', t, t);
  END LOOP;
END $$;
