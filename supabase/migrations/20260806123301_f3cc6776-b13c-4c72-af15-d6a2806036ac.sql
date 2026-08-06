ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS time_checked_in text,
  ADD COLUMN IF NOT EXISTS time_checked_out text,
  ADD COLUMN IF NOT EXISTS material_supplied_by text,
  ADD COLUMN IF NOT EXISTS amount_received numeric,
  ADD COLUMN IF NOT EXISTS balance_amount numeric,
  ADD COLUMN IF NOT EXISTS item_status text;