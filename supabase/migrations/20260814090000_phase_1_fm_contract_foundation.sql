-- Phase 1: Facilities Management / Building AMC contract foundation
-- Additive only: do not remove or alter existing home AMC columns or JSON schedules.

CREATE TABLE public.service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text,
  name text NOT NULL,
  discipline text,
  description text,
  is_ppm_enabled boolean NOT NULL DEFAULT true,
  is_reactive_enabled boolean NOT NULL DEFAULT true,
  default_response_hours numeric,
  default_resolution_hours numeric,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code)
);

CREATE TABLE public.sla_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  priority text,
  request_type text,
  response_hours numeric,
  completion_hours numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_scope_type text,
  ADD COLUMN IF NOT EXISTS site_name text,
  ADD COLUMN IF NOT EXISTS site_address text,
  ADD COLUMN IF NOT EXISTS building_type text,
  ADD COLUMN IF NOT EXISTS contract_manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_cycle text,
  ADD COLUMN IF NOT EXISTS retention_percent numeric,
  ADD COLUMN IF NOT EXISTS vat_percent numeric,
  ADD COLUMN IF NOT EXISTS sla_profile_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL;

CREATE TABLE public.contract_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  sla_policy_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  line_no integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  scope_notes text,
  uom text,
  quantity numeric,
  frequency text,
  unit_rate numeric,
  monthly_amount numeric,
  annual_amount numeric,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contract_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  asset_tag text,
  asset_type text,
  description text,
  make text,
  model text,
  serial_no text,
  location text,
  floor text,
  zone text,
  criticality text,
  warranty_expiry date,
  status text NOT NULL DEFAULT 'Active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, asset_tag)
);

CREATE TABLE public.ppm_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  contract_line_item_id uuid REFERENCES public.contract_line_items(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.contract_assets(id) ON DELETE SET NULL,
  service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  schedule_name text NOT NULL,
  frequency text,
  interval_months integer,
  start_date date,
  end_date date,
  active boolean NOT NULL DEFAULT true,
  instructions text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.ppm_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ppm_schedule_id uuid REFERENCES public.ppm_schedules(id) ON DELETE CASCADE,
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  asset_id uuid REFERENCES public.contract_assets(id) ON DELETE SET NULL,
  service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  planned_date date NOT NULL,
  due_date date,
  assigned_team text,
  status text NOT NULL DEFAULT 'Planned',
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  service_report_id uuid REFERENCES public.service_reports(id) ON DELETE SET NULL,
  completed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contract_manpower_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  role_name text NOT NULL,
  shift_name text,
  required_headcount integer NOT NULL DEFAULT 1,
  hours_per_day numeric,
  days_per_week numeric,
  start_date date,
  end_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.contract_manpower_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  manpower_plan_id uuid REFERENCES public.contract_manpower_plans(id) ON DELETE SET NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name text,
  role_name text,
  shift_name text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'Active',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name text,
  attendance_date date NOT NULL DEFAULT CURRENT_DATE,
  shift_name text,
  check_in timestamptz,
  check_out timestamptz,
  status text NOT NULL DEFAULT 'Present',
  source text,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  sla_policy_id uuid REFERENCES public.sla_policies(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  event_at timestamptz NOT NULL DEFAULT now(),
  response_due_at timestamptz,
  completion_due_at timestamptz,
  response_sla_status text,
  completion_sla_status text,
  delay_reason text,
  exclusion_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.work_orders
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.contract_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ppm_visit_id uuid REFERENCES public.ppm_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS request_type text,
  ADD COLUMN IF NOT EXISTS reported_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_at timestamptz,
  ADD COLUMN IF NOT EXISTS arrived_at timestamptz,
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS response_sla_status text,
  ADD COLUMN IF NOT EXISTS completion_sla_status text,
  ADD COLUMN IF NOT EXISTS delay_reason text,
  ADD COLUMN IF NOT EXISTS sla_exclusion_reason text,
  ADD COLUMN IF NOT EXISTS technician_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS asset_id uuid REFERENCES public.contract_assets(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ppm_visit_id uuid REFERENCES public.ppm_visits(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_type text,
  ADD COLUMN IF NOT EXISTS client_representative text,
  ADD COLUMN IF NOT EXISTS defects_found text,
  ADD COLUMN IF NOT EXISTS follow_up_required boolean;

CREATE TABLE public.reporting_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  period_type text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  label text,
  status text NOT NULL DEFAULT 'Open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contract_id, period_type, period_start, period_end)
);

CREATE TABLE public.weekly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  reporting_period_id uuid REFERENCES public.reporting_periods(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  report_no text,
  status text NOT NULL DEFAULT 'Draft',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ppm_completed integer NOT NULL DEFAULT 0,
  work_orders_completed integer NOT NULL DEFAULT 0,
  open_issues integer NOT NULL DEFAULT 0,
  sla_breaches integer NOT NULL DEFAULT 0,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.monthly_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  reporting_period_id uuid REFERENCES public.reporting_periods(id) ON DELETE SET NULL,
  month_start date NOT NULL,
  month_end date NOT NULL,
  report_no text,
  status text NOT NULL DEFAULT 'Draft',
  summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  ppm_compliance_percent numeric,
  reactive_closure_percent numeric,
  sla_compliance_percent numeric,
  manpower_variance numeric,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_packs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  reporting_period_id uuid REFERENCES public.reporting_periods(id) ON DELETE SET NULL,
  monthly_report_id uuid REFERENCES public.monthly_reports(id) ON DELETE SET NULL,
  invoice_no text,
  period_start date NOT NULL,
  period_end date NOT NULL,
  status text NOT NULL DEFAULT 'Draft',
  base_contract_amount numeric NOT NULL DEFAULT 0,
  variation_amount numeric NOT NULL DEFAULT 0,
  deductions_amount numeric NOT NULL DEFAULT 0,
  retention_amount numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_pack_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_pack_id uuid NOT NULL REFERENCES public.invoice_packs(id) ON DELETE CASCADE,
  contract_line_item_id uuid REFERENCES public.contract_line_items(id) ON DELETE SET NULL,
  work_order_id uuid REFERENCES public.work_orders(id) ON DELETE SET NULL,
  service_report_id uuid REFERENCES public.service_reports(id) ON DELETE SET NULL,
  item_type text NOT NULL,
  description text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_rate numeric NOT NULL DEFAULT 0,
  amount numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_categories_active ON public.service_categories(active);
CREATE INDEX idx_contract_line_items_contract ON public.contract_line_items(contract_id);
CREATE INDEX idx_contract_line_items_category ON public.contract_line_items(service_category_id);
CREATE INDEX idx_contract_assets_contract ON public.contract_assets(contract_id);
CREATE INDEX idx_contract_assets_category ON public.contract_assets(service_category_id);
CREATE INDEX idx_ppm_schedules_contract ON public.ppm_schedules(contract_id);
CREATE INDEX idx_ppm_visits_contract_date ON public.ppm_visits(contract_id, planned_date);
CREATE INDEX idx_ppm_visits_status ON public.ppm_visits(status);
CREATE INDEX idx_manpower_plans_contract ON public.contract_manpower_plans(contract_id);
CREATE INDEX idx_manpower_assignments_contract ON public.contract_manpower_assignments(contract_id);
CREATE INDEX idx_attendance_logs_contract_date ON public.attendance_logs(contract_id, attendance_date);
CREATE INDEX idx_sla_events_work_order ON public.sla_events(work_order_id);
CREATE INDEX idx_reporting_periods_contract ON public.reporting_periods(contract_id, period_start, period_end);
CREATE INDEX idx_weekly_reports_contract_week ON public.weekly_reports(contract_id, week_start, week_end);
CREATE INDEX idx_monthly_reports_contract_month ON public.monthly_reports(contract_id, month_start, month_end);
CREATE INDEX idx_invoice_packs_contract_period ON public.invoice_packs(contract_id, period_start, period_end);
CREATE INDEX idx_invoice_pack_items_pack ON public.invoice_pack_items(invoice_pack_id);
CREATE INDEX idx_work_orders_fm_asset ON public.work_orders(asset_id);
CREATE INDEX idx_work_orders_fm_ppm_visit ON public.work_orders(ppm_visit_id);
CREATE INDEX idx_work_orders_fm_category ON public.work_orders(service_category_id);
CREATE INDEX idx_service_reports_fm_asset ON public.service_reports(asset_id);
CREATE INDEX idx_service_reports_fm_ppm_visit ON public.service_reports(ppm_visit_id);
CREATE INDEX idx_service_reports_fm_category ON public.service_reports(service_category_id);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_categories',
    'contract_line_items',
    'contract_assets',
    'ppm_schedules',
    'ppm_visits',
    'contract_manpower_plans',
    'contract_manpower_assignments',
    'attendance_logs',
    'sla_policies',
    'sla_events',
    'reporting_periods',
    'weekly_reports',
    'monthly_reports',
    'invoice_packs',
    'invoice_pack_items'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (app_private.can(auth.uid(), %L, ''view''))', t || '_select', t, 'contracts');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), %L, ''add''))', t || '_insert', t, 'contracts');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), %L, ''edit'')) WITH CHECK (app_private.can(auth.uid(), %L, ''edit''))', t || '_update', t, 'contracts', 'contracts');
    EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (app_private.can(auth.uid(), %L, ''delete''))', t || '_delete', t, 'contracts');
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_categories',
    'sla_policies',
    'contract_line_items',
    'contract_assets',
    'ppm_schedules',
    'ppm_visits',
    'contract_manpower_plans',
    'contract_manpower_assignments',
    'attendance_logs',
    'reporting_periods',
    'weekly_reports',
    'monthly_reports',
    'invoice_packs'
  ] LOOP
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t || '_updated_at', t);
  END LOOP;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'service_categories',
    'contract_line_items',
    'contract_assets',
    'ppm_schedules',
    'ppm_visits',
    'contract_manpower_plans',
    'contract_manpower_assignments',
    'attendance_logs',
    'sla_policies',
    'sla_events',
    'reporting_periods',
    'weekly_reports',
    'monthly_reports',
    'invoice_packs',
    'invoice_pack_items'
  ] LOOP
    EXECUTE format('CREATE TRIGGER audit_%I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', t, t);
  END LOOP;
END $$;
