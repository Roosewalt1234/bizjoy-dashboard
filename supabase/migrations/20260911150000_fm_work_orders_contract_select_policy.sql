-- Allow an FM field employee to view any fm_work_orders row on a contract
-- they're actively staffed on (not just work orders assigned to them
-- personally) — needed for the Fiz Fix mobile app's Pending Jobs page,
-- which shows all site issues, not only the employee's own reports.
-- Applied live to production on 2026-09-11; this file backfills that
-- change into version control.
CREATE POLICY "fm_work_orders_contract_select"
ON public.fm_work_orders
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM contract_manpower_assignments cma
    JOIN employees e ON e.id = cma.employee_id
    WHERE cma.contract_id = fm_work_orders.contract_id
      AND cma.active = true
      AND e.auth_user_id = auth.uid()
      AND e.status <> 'Terminated'
  )
);
