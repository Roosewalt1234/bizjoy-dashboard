-- Phase 10: Disconnect FM Work Orders from AMC.
-- AMC keeps `work_orders` and its existing code (amc-work-orders.tsx, work-orders-page.tsx,
-- work-order-dialog.tsx) completely untouched. FM gets its own `fm_work_orders` table.

CREATE TABLE public.fm_work_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wo_no text,
  contract_id uuid REFERENCES public.fm_contracts(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  requested_date date DEFAULT CURRENT_DATE,
  scheduled_date date,
  technician_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  technician_name text,
  asset_id uuid REFERENCES public.contract_assets(id) ON DELETE SET NULL,
  ppm_visit_id uuid REFERENCES public.ppm_visits(id) ON DELETE SET NULL,
  service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  service_type text,
  request_type text,
  location text,
  priority text NOT NULL DEFAULT 'Normal',
  problem_reported text,
  work_requested text,
  notes text,
  status text NOT NULL DEFAULT 'Open',
  reported_at timestamptz,
  responded_at timestamptz,
  arrived_at timestamptz,
  completed_at timestamptz,
  response_due_at timestamptz,
  completion_due_at timestamptz,
  response_sla_status text,
  completion_sla_status text,
  delay_reason text,
  sla_exclusion_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_work_orders TO authenticated;
GRANT ALL ON public.fm_work_orders TO service_role;
ALTER TABLE public.fm_work_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_work_orders_select ON public.fm_work_orders FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'service', 'view'));
CREATE POLICY fm_work_orders_insert ON public.fm_work_orders FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'service', 'add'));
CREATE POLICY fm_work_orders_update ON public.fm_work_orders FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'service', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'service', 'edit'));
CREATE POLICY fm_work_orders_delete ON public.fm_work_orders FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'service', 'delete'));
CREATE INDEX idx_fm_work_orders_contract ON public.fm_work_orders(contract_id);
CREATE INDEX idx_fm_work_orders_status ON public.fm_work_orders(status);
CREATE TRIGGER fm_work_orders_updated_at BEFORE UPDATE ON public.fm_work_orders FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_work_orders AFTER INSERT OR UPDATE OR DELETE ON public.fm_work_orders FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Migrate existing FM rows, preserving ids
INSERT INTO public.fm_work_orders (
  id, wo_no, contract_id, customer_id, customer_name, requested_date, scheduled_date,
  technician_id, technician_name, asset_id, ppm_visit_id, service_category_id,
  service_type, request_type, location, priority, problem_reported, work_requested, notes, status,
  reported_at, responded_at, arrived_at, completed_at, response_due_at, completion_due_at,
  response_sla_status, completion_sla_status, delay_reason, sla_exclusion_reason,
  created_at, updated_at
)
SELECT
  id, wo_no, contract_id, customer_id, customer_name, requested_date, scheduled_date,
  technician_id, technician_name, asset_id, ppm_visit_id, service_category_id,
  service_type, request_type, location, priority, problem_reported, work_requested, notes, status,
  reported_at, responded_at, arrived_at, completed_at, response_due_at, completion_due_at,
  response_sla_status, completion_sla_status, delay_reason, sla_exclusion_reason,
  created_at, updated_at
FROM public.work_orders
WHERE module_type = 'FM';

-- Repoint FM-only child tables' FK from work_orders to fm_work_orders (data untouched, ids match)
ALTER TABLE public.ppm_visits
  DROP CONSTRAINT ppm_visits_work_order_id_fkey,
  ADD CONSTRAINT ppm_visits_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.fm_work_orders(id) ON DELETE SET NULL;

ALTER TABLE public.sla_events
  DROP CONSTRAINT sla_events_work_order_id_fkey,
  ADD CONSTRAINT sla_events_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.fm_work_orders(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_pack_items
  DROP CONSTRAINT invoice_pack_items_work_order_id_fkey,
  ADD CONSTRAINT invoice_pack_items_work_order_id_fkey FOREIGN KEY (work_order_id) REFERENCES public.fm_work_orders(id) ON DELETE SET NULL;

-- Remove the migrated FM rows from the AMC-owned work_orders table (clean disconnect).
-- service_reports.work_order_id (ON DELETE SET NULL) is untouched/still points at `work_orders` -
-- there are 0 FM-linked service reports today, and FM Service Reports is its own future section.
DELETE FROM public.work_orders WHERE module_type = 'FM';