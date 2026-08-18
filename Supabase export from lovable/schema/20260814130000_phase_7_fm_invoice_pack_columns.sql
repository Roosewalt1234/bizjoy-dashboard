-- Phase 7: invoice pack and client submission pack fields.
-- This extends the Phase 1 invoice tables without renaming or removing existing columns.

ALTER TABLE public.invoice_packs
  ADD COLUMN IF NOT EXISTS billing_period_start date,
  ADD COLUMN IF NOT EXISTS billing_period_end date,
  ADD COLUMN IF NOT EXISTS invoice_month text,
  ADD COLUMN IF NOT EXISTS subtotal_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vat_percent numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS retention_percent numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS deduction_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adjustment_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS gross_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_payable numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prepared_by text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS client_reference text,
  ADD COLUMN IF NOT EXISTS remarks text,
  ADD COLUMN IF NOT EXISTS report_data jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.invoice_pack_items
  ADD COLUMN IF NOT EXISTS service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS vat_applicable boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS remarks text;

UPDATE public.invoice_packs
SET
  billing_period_start = COALESCE(billing_period_start, period_start),
  billing_period_end = COALESCE(billing_period_end, period_end),
  invoice_month = COALESCE(invoice_month, to_char(period_start, 'YYYY-MM')),
  subtotal_amount = COALESCE(NULLIF(subtotal_amount, 0), base_contract_amount, 0),
  deduction_amount = COALESCE(NULLIF(deduction_amount, 0), deductions_amount, 0),
  gross_amount = COALESCE(NULLIF(gross_amount, 0), base_contract_amount + vat_amount, total_amount, 0),
  net_payable = COALESCE(NULLIF(net_payable, 0), total_amount, 0),
  invoice_number = COALESCE(invoice_number, invoice_no),
  remarks = COALESCE(remarks, notes)
WHERE billing_period_start IS NULL
   OR billing_period_end IS NULL
   OR invoice_month IS NULL
   OR invoice_number IS NULL
   OR remarks IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoice_packs_contract_month
  ON public.invoice_packs(contract_id, invoice_month);

CREATE INDEX IF NOT EXISTS idx_invoice_packs_status
  ON public.invoice_packs(status);

CREATE INDEX IF NOT EXISTS idx_invoice_pack_items_category
  ON public.invoice_pack_items(service_category_id);
