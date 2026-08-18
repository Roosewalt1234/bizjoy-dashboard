ALTER TABLE public.service_reports
  ADD COLUMN IF NOT EXISTS google_rating integer,
  ADD COLUMN IF NOT EXISTS google_review text;