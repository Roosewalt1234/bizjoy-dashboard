
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS payment_terms text,
  ADD COLUMN IF NOT EXISTS ppm_1_date date,
  ADD COLUMN IF NOT EXISTS ppm_2_date date,
  ADD COLUMN IF NOT EXISTS ppm_3_date date,
  ADD COLUMN IF NOT EXISTS ppm_4_date date,
  ADD COLUMN IF NOT EXISTS water_tank_cleaning_date date,
  ADD COLUMN IF NOT EXISTS water_tank_cleaning_status text,
  ADD COLUMN IF NOT EXISTS remark text;

CREATE TABLE IF NOT EXISTS public.contract_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  payment_date date,
  value numeric,
  status text DEFAULT 'Pending',
  received_date date,
  sort_order int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.contract_payments TO authenticated;
GRANT ALL ON public.contract_payments TO service_role;

ALTER TABLE public.contract_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contract payments" ON public.contract_payments
  FOR ALL TO authenticated
  USING (app_private.has_role(auth.uid(), 'admin'))
  WITH CHECK (app_private.has_role(auth.uid(), 'admin'));

CREATE INDEX IF NOT EXISTS idx_contract_payments_contract_id ON public.contract_payments(contract_id);
