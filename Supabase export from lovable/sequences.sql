-- Restore document-number sequences after data import
SELECT setval('public.work_order_no_seq', 4, true);
SELECT setval('public.service_report_no_seq', 31, true);
