ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS ppm_schedule jsonb,
  ADD COLUMN IF NOT EXISTS ac_duct_cleaning_date date,
  ADD COLUMN IF NOT EXISTS ac_duct_cleaning_status text;