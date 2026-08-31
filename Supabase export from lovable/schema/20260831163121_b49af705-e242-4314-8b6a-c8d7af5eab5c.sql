-- Phase 9: Disconnect FM Contracts from AMC entirely.
-- AMC keeps `contracts` / `contract_payments` and all its existing code untouched.
-- FM gets its own `fm_contracts` / `fm_contract_payments` tables. After this migration,
-- the only table shared between AMC and FM is `customers`.

-- 1. New fm_contracts table (FM-only fields; no module_type discriminator needed)
CREATE TABLE public.fm_contracts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  contract_no text,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  contract_scope_type text,
  site_name text,
  site_address text,
  building_type text,
  start_date date,
  end_date date,
  value numeric,
  billing_cycle text,
  payment_terms text,
  retention_percent numeric,
  vat_percent numeric,
  contract_manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  sla_profile_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Draft',
  remark text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_contracts TO authenticated;
GRANT ALL ON public.fm_contracts TO service_role;
ALTER TABLE public.fm_contracts ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_contracts_select ON public.fm_contracts FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'view'));
CREATE POLICY fm_contracts_insert ON public.fm_contracts FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'contracts', 'add'));
CREATE POLICY fm_contracts_update ON public.fm_contracts FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'contracts', 'edit'));
CREATE POLICY fm_contracts_delete ON public.fm_contracts FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'delete'));
CREATE TRIGGER fm_contracts_updated_at BEFORE UPDATE ON public.fm_contracts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_contracts AFTER INSERT OR UPDATE OR DELETE ON public.fm_contracts FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- 2. New fm_contract_payments table (mirrors contract_payments, dedicated to FM)
CREATE TABLE public.fm_contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.fm_contracts(id) ON DELETE CASCADE,
  payment_date date,
  value numeric,
  status text DEFAULT 'Pending',
  received_date date,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_contract_payments TO authenticated;
GRANT ALL ON public.fm_contract_payments TO service_role;
ALTER TABLE public.fm_contract_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_contract_payments_select ON public.fm_contract_payments FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'view'));
CREATE POLICY fm_contract_payments_insert ON public.fm_contract_payments FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'contracts', 'add'));
CREATE POLICY fm_contract_payments_update ON public.fm_contract_payments FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'contracts', 'edit'));
CREATE POLICY fm_contract_payments_delete ON public.fm_contract_payments FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'delete'));
CREATE INDEX idx_fm_contract_payments_contract_id ON public.fm_contract_payments(contract_id);
CREATE TRIGGER audit_fm_contract_payments AFTER INSERT OR UPDATE OR DELETE ON public.fm_contract_payments FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- 3. Migrate existing FM rows out of contracts/contract_payments, preserving IDs
INSERT INTO public.fm_contracts (
  id, title, contract_no, customer_id, customer_name, contract_scope_type, site_name,
  site_address, building_type, start_date, end_date, value, billing_cycle, payment_terms,
  retention_percent, vat_percent, contract_manager_id, sla_profile_id, status, remark, created_at
)
SELECT
  id, title, contract_no, customer_id, customer_name, contract_scope_type, site_name,
  site_address, building_type, start_date, end_date, value, billing_cycle, payment_terms,
  retention_percent, vat_percent, contract_manager_id, sla_profile_id, status, remark, created_at
FROM public.contracts
WHERE module_type = 'FM';

INSERT INTO public.fm_contract_payments (id, contract_id, payment_date, value, status, received_date, sort_order, created_at)
SELECT p.id, p.contract_id, p.payment_date, p.value, p.status, p.received_date, p.sort_order, p.created_at
FROM public.contract_payments p
JOIN public.contracts c ON c.id = p.contract_id
WHERE c.module_type = 'FM';

DELETE FROM public.contract_payments
WHERE contract_id IN (SELECT id FROM public.contracts WHERE module_type = 'FM');

-- 4. Repoint every FM-only child table's FK from contracts to fm_contracts.
--    Data is untouched: ids already match since fm_contracts preserved the same ids.
ALTER TABLE public.attendance_logs
  DROP CONSTRAINT attendance_logs_contract_id_fkey,
  ADD CONSTRAINT attendance_logs_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.contract_assets
  DROP CONSTRAINT contract_assets_contract_id_fkey,
  ADD CONSTRAINT contract_assets_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.contract_billing_lines
  DROP CONSTRAINT contract_billing_lines_contract_id_fkey,
  ADD CONSTRAINT contract_billing_lines_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.contract_consumables
  DROP CONSTRAINT contract_consumables_contract_id_fkey,
  ADD CONSTRAINT contract_consumables_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.contract_line_items
  DROP CONSTRAINT contract_line_items_contract_id_fkey,
  ADD CONSTRAINT contract_line_items_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.contract_manpower_assignments
  DROP CONSTRAINT contract_manpower_assignments_contract_id_fkey,
  ADD CONSTRAINT contract_manpower_assignments_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.contract_manpower_plans
  DROP CONSTRAINT contract_manpower_plans_contract_id_fkey,
  ADD CONSTRAINT contract_manpower_plans_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.fm_cleaning_checklist_templates
  DROP CONSTRAINT fm_cleaning_checklist_templates_fm_contract_id_fkey,
  ADD CONSTRAINT fm_cleaning_checklist_templates_fm_contract_id_fkey FOREIGN KEY (fm_contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.fm_daily_cleaning_checks
  DROP CONSTRAINT fm_daily_cleaning_checks_fm_contract_id_fkey,
  ADD CONSTRAINT fm_daily_cleaning_checks_fm_contract_id_fkey FOREIGN KEY (fm_contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.invoice_packs
  DROP CONSTRAINT invoice_packs_contract_id_fkey,
  ADD CONSTRAINT invoice_packs_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.monthly_reports
  DROP CONSTRAINT monthly_reports_contract_id_fkey,
  ADD CONSTRAINT monthly_reports_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.ppm_schedules
  DROP CONSTRAINT ppm_schedules_contract_id_fkey,
  ADD CONSTRAINT ppm_schedules_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.ppm_visits
  DROP CONSTRAINT ppm_visits_contract_id_fkey,
  ADD CONSTRAINT ppm_visits_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.reporting_periods
  DROP CONSTRAINT reporting_periods_contract_id_fkey,
  ADD CONSTRAINT reporting_periods_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.sla_events
  DROP CONSTRAINT sla_events_contract_id_fkey,
  ADD CONSTRAINT sla_events_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.sla_policies
  DROP CONSTRAINT sla_policies_contract_id_fkey,
  ADD CONSTRAINT sla_policies_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

ALTER TABLE public.weekly_reports
  DROP CONSTRAINT weekly_reports_contract_id_fkey,
  ADD CONSTRAINT weekly_reports_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES public.fm_contracts(id) ON DELETE CASCADE;

-- 5. Remove the migrated FM rows from the AMC-owned contracts table (clean disconnect).
-- Note: work_orders/service_reports.contract_id use ON DELETE SET NULL, so any of those
-- rows currently linked to the FM contract will simply lose that link (not be deleted) -
-- expected until the FM Work Orders / FM Service Reports sections get the same treatment.
DELETE FROM public.contracts WHERE module_type = 'FM';

-- module_type is left in place on `contracts` (now always 'AMC') since amc-contracts.tsx /
-- contracts-page.tsx still write it on every save and are intentionally left untouched.