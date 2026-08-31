-- Replace open-access policies on contract_billing_lines with permission checks
DROP POLICY IF EXISTS "auth read contract_billing_lines" ON public.contract_billing_lines;
DROP POLICY IF EXISTS "auth insert contract_billing_lines" ON public.contract_billing_lines;
DROP POLICY IF EXISTS "auth update contract_billing_lines" ON public.contract_billing_lines;
DROP POLICY IF EXISTS "auth delete contract_billing_lines" ON public.contract_billing_lines;

CREATE POLICY "auth read contract_billing_lines" ON public.contract_billing_lines FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'view'));
CREATE POLICY "auth insert contract_billing_lines" ON public.contract_billing_lines FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'contracts', 'add'));
CREATE POLICY "auth update contract_billing_lines" ON public.contract_billing_lines FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'contracts', 'edit'));
CREATE POLICY "auth delete contract_billing_lines" ON public.contract_billing_lines FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'delete'));

-- Replace open-access policies on contract_consumables with permission checks
DROP POLICY IF EXISTS "auth read contract_consumables" ON public.contract_consumables;
DROP POLICY IF EXISTS "auth insert contract_consumables" ON public.contract_consumables;
DROP POLICY IF EXISTS "auth update contract_consumables" ON public.contract_consumables;
DROP POLICY IF EXISTS "auth delete contract_consumables" ON public.contract_consumables;

CREATE POLICY "auth read contract_consumables" ON public.contract_consumables FOR SELECT TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'view'));
CREATE POLICY "auth insert contract_consumables" ON public.contract_consumables FOR INSERT TO authenticated WITH CHECK (app_private.can(auth.uid(), 'contracts', 'add'));
CREATE POLICY "auth update contract_consumables" ON public.contract_consumables FOR UPDATE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'edit')) WITH CHECK (app_private.can(auth.uid(), 'contracts', 'edit'));
CREATE POLICY "auth delete contract_consumables" ON public.contract_consumables FOR DELETE TO authenticated USING (app_private.can(auth.uid(), 'contracts', 'delete'));