ALTER TABLE public.contracts ADD COLUMN IF NOT EXISTS module_type text NOT NULL DEFAULT 'AMC';
ALTER TABLE public.work_orders ADD COLUMN IF NOT EXISTS module_type text NOT NULL DEFAULT 'AMC';
ALTER TABLE public.service_reports ADD COLUMN IF NOT EXISTS module_type text NOT NULL DEFAULT 'AMC';

UPDATE public.contracts SET module_type = 'AMC' WHERE module_type IS NULL OR module_type NOT IN ('AMC','FM');
UPDATE public.work_orders SET module_type = 'AMC' WHERE module_type IS NULL OR module_type NOT IN ('AMC','FM');
UPDATE public.service_reports SET module_type = 'AMC' WHERE module_type IS NULL OR module_type NOT IN ('AMC','FM');

DO $$ BEGIN
  ALTER TABLE public.contracts ADD CONSTRAINT contracts_module_type_check CHECK (module_type IN ('AMC','FM'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.work_orders ADD CONSTRAINT work_orders_module_type_check CHECK (module_type IN ('AMC','FM'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.service_reports ADD CONSTRAINT service_reports_module_type_check CHECK (module_type IN ('AMC','FM'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_contracts_module_type ON public.contracts(module_type);
CREATE INDEX IF NOT EXISTS idx_work_orders_module_type ON public.work_orders(module_type);
CREATE INDEX IF NOT EXISTS idx_service_reports_module_type ON public.service_reports(module_type);