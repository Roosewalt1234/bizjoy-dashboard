-- Phase 4: SLA policy scoping and minute-based SLA durations.
-- Additive only; preserves existing response_hours/completion_hours consumers.

ALTER TABLE public.sla_policies
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.contracts(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS service_category_id uuid REFERENCES public.service_categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS response_minutes integer,
  ADD COLUMN IF NOT EXISTS completion_minutes integer;

UPDATE public.sla_policies
SET
  response_minutes = COALESCE(response_minutes, (response_hours * 60)::integer),
  completion_minutes = COALESCE(completion_minutes, (completion_hours * 60)::integer)
WHERE response_minutes IS NULL OR completion_minutes IS NULL;

CREATE INDEX IF NOT EXISTS idx_sla_policies_contract ON public.sla_policies(contract_id);
CREATE INDEX IF NOT EXISTS idx_sla_policies_category ON public.sla_policies(service_category_id);
CREATE INDEX IF NOT EXISTS idx_sla_policies_match
  ON public.sla_policies(contract_id, service_category_id, priority, request_type, active);
