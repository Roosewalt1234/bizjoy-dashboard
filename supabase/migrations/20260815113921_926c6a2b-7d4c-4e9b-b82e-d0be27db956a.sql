UPDATE public.work_orders w
SET module_type = 'FM'
FROM public.contracts c
WHERE c.id = w.contract_id
  AND c.module_type = 'FM'
  AND w.module_type <> 'FM';