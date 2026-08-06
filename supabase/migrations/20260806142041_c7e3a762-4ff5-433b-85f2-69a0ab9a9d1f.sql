CREATE SEQUENCE IF NOT EXISTS public.work_order_no_seq START WITH 1;
CREATE SEQUENCE IF NOT EXISTS public.service_report_no_seq START WITH 24;

CREATE OR REPLACE FUNCTION public.next_doc_no(kind text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE n bigint;
BEGIN
  IF kind = 'work_order' THEN
    n := nextval('public.work_order_no_seq');
    RETURN 'WO-' || lpad(n::text, 4, '0');
  ELSIF kind = 'service_report' THEN
    n := nextval('public.service_report_no_seq');
    RETURN 'SR-' || lpad(n::text, 4, '0');
  ELSE
    RAISE EXCEPTION 'unknown kind %', kind;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.next_doc_no(text) FROM public;
GRANT EXECUTE ON FUNCTION public.next_doc_no(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.next_doc_no(text) TO service_role;