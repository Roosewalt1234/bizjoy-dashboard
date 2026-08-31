-- Phase 11: Give FM its own Service Reports table.
-- AMC keeps `service_reports` / `service_report_photos` and its existing code
-- (amc-service-reports.tsx, service-report-dialog.tsx) completely untouched.
-- There are currently 0 FM-flagged service reports, so this is schema-only - no data
-- to migrate - but FM never had its own report page at all until now, only AMC did.

CREATE TABLE public.fm_service_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_no text,
  contract_id uuid REFERENCES public.fm_contracts(id) ON DELETE SET NULL,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text,
  work_order_id uuid REFERENCES public.fm_work_orders(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.contract_assets(id) ON DELETE SET NULL,
  ppm_visit_id uuid REFERENCES public.ppm_visits(id) ON DELETE SET NULL,
  service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  service_date date,
  time_checked_in time without time zone,
  time_checked_out time without time zone,
  technician_name text,
  service_type text,
  location text,
  problem_reported text,
  work_done text,
  parts_used text,
  hours_spent numeric,
  completion_type text,
  client_representative text,
  defects_found text,
  follow_up_required boolean,
  recommendations text,
  next_service_date date,
  signed_by text,
  signature_data text,
  status text NOT NULL DEFAULT 'Draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_service_reports TO authenticated;
GRANT ALL ON public.fm_service_reports TO service_role;
ALTER TABLE public.fm_service_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_service_reports_select ON public.fm_service_reports FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'service', 'view'));
CREATE POLICY fm_service_reports_insert ON public.fm_service_reports FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'service', 'add'));
CREATE POLICY fm_service_reports_update ON public.fm_service_reports FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'service', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'service', 'edit'));
CREATE POLICY fm_service_reports_delete ON public.fm_service_reports FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'service', 'delete'));
CREATE INDEX idx_fm_service_reports_contract ON public.fm_service_reports(contract_id);
CREATE INDEX idx_fm_service_reports_work_order ON public.fm_service_reports(work_order_id);
CREATE TRIGGER fm_service_reports_updated_at BEFORE UPDATE ON public.fm_service_reports FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER audit_fm_service_reports AFTER INSERT OR UPDATE OR DELETE ON public.fm_service_reports FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TABLE public.fm_service_report_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.fm_service_reports(id) ON DELETE CASCADE,
  caption text,
  before_path text,
  after_path text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fm_service_report_photos TO authenticated;
GRANT ALL ON public.fm_service_report_photos TO service_role;
ALTER TABLE public.fm_service_report_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY fm_service_report_photos_select ON public.fm_service_report_photos FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'service', 'view'));
CREATE POLICY fm_service_report_photos_insert ON public.fm_service_report_photos FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'service', 'add'));
CREATE POLICY fm_service_report_photos_update ON public.fm_service_report_photos FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'service', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'service', 'edit'));
CREATE POLICY fm_service_report_photos_delete ON public.fm_service_report_photos FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'service', 'delete'));
CREATE INDEX idx_fm_service_report_photos_report ON public.fm_service_report_photos(report_id);
CREATE TRIGGER audit_fm_service_report_photos AFTER INSERT OR UPDATE OR DELETE ON public.fm_service_report_photos FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

-- Repoint the FM-only child tables that could reference a service report.
-- No data to move (0 rows on both sides today) - just switching the FK target.
ALTER TABLE public.ppm_visits
  DROP CONSTRAINT ppm_visits_service_report_id_fkey,
  ADD CONSTRAINT ppm_visits_service_report_id_fkey FOREIGN KEY (service_report_id) REFERENCES public.fm_service_reports(id) ON DELETE SET NULL;

ALTER TABLE public.invoice_pack_items
  DROP CONSTRAINT invoice_pack_items_service_report_id_fkey,
  ADD CONSTRAINT invoice_pack_items_service_report_id_fkey FOREIGN KEY (service_report_id) REFERENCES public.fm_service_reports(id) ON DELETE SET NULL;
