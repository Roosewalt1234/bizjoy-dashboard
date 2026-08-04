CREATE TABLE public.work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_no text,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  requested_date date DEFAULT CURRENT_DATE,
  scheduled_date date,
  technician_name text,
  service_type text,
  location text,
  priority text NOT NULL DEFAULT 'Normal',
  problem_reported text,
  work_requested text,
  notes text,
  status text NOT NULL DEFAULT 'Open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_orders TO authenticated;
GRANT ALL ON public.work_orders TO service_role;

ALTER TABLE public.work_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_orders_select ON public.work_orders FOR SELECT TO authenticated
  USING (app_private.can(auth.uid(), 'service', 'view'));
CREATE POLICY work_orders_insert ON public.work_orders FOR INSERT TO authenticated
  WITH CHECK (app_private.can(auth.uid(), 'service', 'add'));
CREATE POLICY work_orders_update ON public.work_orders FOR UPDATE TO authenticated
  USING (app_private.can(auth.uid(), 'service', 'edit'))
  WITH CHECK (app_private.can(auth.uid(), 'service', 'edit'));
CREATE POLICY work_orders_delete ON public.work_orders FOR DELETE TO authenticated
  USING (app_private.can(auth.uid(), 'service', 'delete'));

CREATE TRIGGER work_orders_updated_at BEFORE UPDATE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER audit_work_orders AFTER INSERT OR UPDATE OR DELETE ON public.work_orders
  FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

ALTER TABLE public.service_reports
  ADD COLUMN work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL;

CREATE INDEX idx_service_reports_work_order ON public.service_reports(work_order_id);
CREATE INDEX idx_work_orders_status ON public.work_orders(status);