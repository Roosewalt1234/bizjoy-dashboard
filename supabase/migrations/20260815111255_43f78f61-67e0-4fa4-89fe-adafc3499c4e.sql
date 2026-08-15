ALTER TABLE public.contract_billing_lines
  ADD COLUMN IF NOT EXISTS is_total_row boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_contract_billing_lines_is_total ON public.contract_billing_lines(contract_id, is_total_row);