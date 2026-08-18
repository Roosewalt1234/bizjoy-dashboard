ALTER TABLE public.contracts ADD COLUMN amc_ref_no text NULL;

GRANT ALL ON public.contracts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contracts TO authenticated; -- ensure no change in privileges