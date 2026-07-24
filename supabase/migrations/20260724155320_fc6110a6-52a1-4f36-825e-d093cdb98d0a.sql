ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS contract_type text,
  ADD COLUMN IF NOT EXISTS spare_parts_amount numeric;