UPDATE public.sla_policies
SET response_minutes = NULL,
    completion_minutes = NULL,
    response_hours = NULL,
    completion_hours = NULL,
    request_type = 'PPM',
    description = COALESCE(description, '') || ' Schedule-based: compliance is measured by completion within the scheduled visit date/period.'
WHERE name = 'PPM Compliance';

UPDATE public.work_orders w
SET response_due_at = NULL,
    response_sla_status = 'Not Applicable',
    completion_due_at = (w.scheduled_date::timestamp + interval '23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Dubai',
    completion_sla_status = CASE
      WHEN w.completed_at IS NOT NULL
        AND w.completed_at <= ((w.scheduled_date::timestamp + interval '23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Dubai')
        THEN 'Within SLA'
      WHEN w.completed_at IS NOT NULL THEN 'Breached'
      WHEN now() > ((w.scheduled_date::timestamp + interval '23 hours 59 minutes 59 seconds') AT TIME ZONE 'Asia/Dubai') THEN 'Breached'
      ELSE 'Not Started'
    END
FROM public.contracts c
WHERE c.id = w.contract_id
  AND c.module_type = 'FM'
  AND w.module_type = 'FM'
  AND w.request_type = 'PPM'
  AND w.scheduled_date IS NOT NULL;

UPDATE public.weekly_reports
SET remarks = COALESCE(NULLIF(remarks, ''), 'TEST DATA - smoke test')
WHERE report_no = 'WR-2026-08-10';

UPDATE public.monthly_reports
SET remarks = COALESCE(NULLIF(remarks, ''), 'TEST DATA - smoke test')
WHERE report_no = 'MR-2026-08';

UPDATE public.invoice_packs
SET remarks = COALESCE(NULLIF(remarks, ''), 'TEST DATA - smoke test')
WHERE invoice_no = 'INV-2026-08';