-- Replace open-access policies on handyman_hours_log with permission checks
DROP POLICY IF EXISTS "Authenticated can view handyman hours" ON public.handyman_hours_log;
DROP POLICY IF EXISTS "Authenticated can insert handyman hours" ON public.handyman_hours_log;
DROP POLICY IF EXISTS "Authenticated can update handyman hours" ON public.handyman_hours_log;
DROP POLICY IF EXISTS "Authenticated can delete handyman hours" ON public.handyman_hours_log;

CREATE POLICY "Authenticated can view handyman hours" ON public.handyman_hours_log FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'view'));
CREATE POLICY "Authenticated can insert handyman hours" ON public.handyman_hours_log FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'contracts', 'add'));
CREATE POLICY "Authenticated can update handyman hours" ON public.handyman_hours_log FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'contracts', 'edit'));
CREATE POLICY "Authenticated can delete handyman hours" ON public.handyman_hours_log FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'delete'));