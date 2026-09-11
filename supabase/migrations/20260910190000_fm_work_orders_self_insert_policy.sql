-- Allow an FM field employee to create their own fm_work_orders row (e.g. from
-- the Fiz Fix mobile app's Report Snag feature), scoped strictly to inserting
-- with themselves as technician_id. Applied live to production on 2026-09-10;
-- this file backfills that change into version control.
CREATE POLICY "fm_work_orders_self_insert"
ON public.fm_work_orders
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = fm_work_orders.technician_id
      AND e.auth_user_id = auth.uid()
      AND e.status <> 'Terminated'
  )
);
