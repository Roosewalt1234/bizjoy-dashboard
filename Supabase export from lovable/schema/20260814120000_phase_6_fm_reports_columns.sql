-- Phase 6: FM weekly/monthly report compatibility columns.
-- Additive only; preserves existing summary/date columns.

ALTER TABLE public.reporting_periods
  ADD COLUMN IF NOT EXISTS remarks text;

ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prepared_by text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

ALTER TABLE public.monthly_reports
  ADD COLUMN IF NOT EXISTS report_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS prepared_by text,
  ADD COLUMN IF NOT EXISTS reviewed_by text,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz;

UPDATE public.weekly_reports
SET report_data = COALESCE(NULLIF(report_data, '{}'::jsonb), summary, '{}'::jsonb)
WHERE report_data = '{}'::jsonb AND summary <> '{}'::jsonb;

UPDATE public.monthly_reports
SET report_data = COALESCE(NULLIF(report_data, '{}'::jsonb), summary, '{}'::jsonb)
WHERE report_data = '{}'::jsonb AND summary <> '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_weekly_reports_status ON public.weekly_reports(status);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_status ON public.monthly_reports(status);
