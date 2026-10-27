-- Work order assignment WhatsApp alerts: when an FM work order is assigned to a worker, queue
-- a private message to the worker and a post in the Parkside group. Anna claims them through
-- the wo-assign-bot Edge Function (service_role), same discipline as snag_notifications.
-- Posting stays off until wo_assignment_notification_settings.posting_enabled_at is set;
-- rows queued before that moment are skipped, never sent.

-- WhatsApp number from a free-text phone: digits only, UAE local (05x / 5x) -> 971..., NULL if unusable.
CREATE OR REPLACE FUNCTION app_private.whatsapp_number(p_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_temp
AS $$
DECLARE
  d text := regexp_replace(coalesce(p_phone, ''), '\D', '', 'g');
BEGIN
  IF d LIKE '00%' THEN d := substr(d, 3); END IF;
  IF length(d) = 10 AND d LIKE '05%' THEN RETURN '971' || substr(d, 2); END IF;
  IF length(d) = 9 AND d LIKE '5%' THEN RETURN '971' || d; END IF;
  IF length(d) BETWEEN 11 AND 15 AND d !~ '^0' THEN RETURN d; END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION app_private.whatsapp_number(text) FROM PUBLIC, anon, authenticated;

CREATE TABLE public.wo_assignment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL REFERENCES public.fm_work_orders(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('direct','group')),
  -- direct: worker's WhatsApp number (digits, international); group: NULL
  recipient text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed','uncertain','skipped')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  claim_token uuid,
  sent_at timestamptz,
  wa_message_id text,
  last_error text,
  destination text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX wo_assignment_notifications_work_order_idx ON public.wo_assignment_notifications (work_order_id);
CREATE INDEX wo_assignment_notifications_pending_idx ON public.wo_assignment_notifications (created_at)
  WHERE status = 'pending';
ALTER TABLE public.wo_assignment_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY wo_assignment_notifications_select ON public.wo_assignment_notifications
  FOR SELECT USING (app_private.can(auth.uid(), 'service', 'view'));

CREATE TABLE public.wo_assignment_notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  posting_enabled_at timestamptz
);
ALTER TABLE public.wo_assignment_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY wo_assignment_notification_settings_select ON public.wo_assignment_notification_settings
  FOR SELECT USING (app_private.can(auth.uid(), 'service', 'view'));
INSERT INTO public.wo_assignment_notification_settings (id, posting_enabled_at) VALUES (true, NULL);

REVOKE ALL ON public.wo_assignment_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.wo_assignment_notification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.wo_assignment_notifications TO service_role;
GRANT ALL ON public.wo_assignment_notification_settings TO service_role;

-- Trigger: queue alerts whenever the technician changes (Edit dialog, Assign picker, anything).
-- Snag inserts set technician_id to the reporter, so inserts only count when they are not snags.
-- Must never make the work order write fail.
CREATE OR REPLACE FUNCTION app_private.queue_wo_assignment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_number text;
BEGIN
  BEGIN
    IF NEW.technician_id IS NULL THEN RETURN NEW; END IF;
    IF TG_OP = 'UPDATE' AND NEW.technician_id IS NOT DISTINCT FROM OLD.technician_id THEN RETURN NEW; END IF;
    IF TG_OP = 'INSERT' AND coalesce(NEW.notes, '') LIKE '[SNAG REPORT]%' THEN RETURN NEW; END IF;

    SELECT app_private.whatsapp_number(e.phone) INTO v_number
      FROM public.employees e WHERE e.id = NEW.technician_id;

    INSERT INTO public.wo_assignment_notifications
      (work_order_id, employee_id, kind, recipient, destination, status, last_error)
    VALUES
      (NEW.id, NEW.technician_id, 'direct', v_number, coalesce(v_number, 'none'),
       CASE WHEN v_number IS NULL THEN 'skipped' ELSE 'pending' END,
       CASE WHEN v_number IS NULL THEN 'no_whatsapp_number' END),
      (NEW.id, NEW.technician_id, 'group', NULL, 'Operations - 48 Parkside Maintenance', 'pending', NULL);
  EXCEPTION WHEN others THEN
    RAISE WARNING 'queue_wo_assignment_notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.queue_wo_assignment_notification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_queue_wo_assignment_notification
  AFTER INSERT OR UPDATE OF technician_id ON public.fm_work_orders
  FOR EACH ROW EXECUTE FUNCTION app_private.queue_wo_assignment_notification();

-- Picker: staff allocated (active, in date) to the work order's FM contract.
-- Never returns phone numbers, only whether a usable WhatsApp number exists.
CREATE OR REPLACE FUNCTION public.list_fm_work_order_assignable_staff(p_work_order_id uuid)
RETURNS TABLE(employee_id uuid, name text, role_name text, has_whatsapp boolean, is_current boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT DISTINCT ON (e.id)
         e.id,
         coalesce(nullif(e.full_name, ''), nullif(concat_ws(' ', e.first_name, e.last_name), ''), a.employee_name),
         coalesce(a.role_name, a.designation),
         app_private.whatsapp_number(e.phone) IS NOT NULL,
         w.technician_id = e.id
    FROM public.fm_work_orders w
    JOIN public.contract_manpower_assignments a ON a.contract_id = w.contract_id
    JOIN public.employees e ON e.id = a.employee_id
   WHERE w.id = p_work_order_id
     AND app_private.can(auth.uid(), 'service', 'edit')
     AND coalesce(a.active, true)
     AND coalesce(a.status, 'Active') = 'Active'
     AND (a.start_date IS NULL OR a.start_date <= current_date)
     AND (a.end_date IS NULL OR a.end_date >= current_date)
     AND coalesce(e.status, 'Active') = 'Active'
   ORDER BY e.id, a.start_date DESC NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.list_fm_work_order_assignable_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_fm_work_order_assignable_staff(uuid) TO authenticated;

-- Assign: only to someone allocated to the work order's contract. The trigger queues the alerts.
CREATE OR REPLACE FUNCTION public.assign_fm_work_order(p_work_order_id uuid, p_employee_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  v_name text;
  v_has_whatsapp boolean;
  v_previous uuid;
BEGIN
  IF NOT app_private.can(auth.uid(), 'service', 'edit') THEN
    RAISE EXCEPTION 'not_allowed' USING ERRCODE = '42501';
  END IF;

  SELECT s.name, s.has_whatsapp INTO v_name, v_has_whatsapp
    FROM public.list_fm_work_order_assignable_staff(p_work_order_id) s
   WHERE s.employee_id = p_employee_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'not_allocated_to_contract';
  END IF;

  SELECT technician_id INTO v_previous FROM public.fm_work_orders WHERE id = p_work_order_id FOR UPDATE;
  UPDATE public.fm_work_orders
     SET technician_id = p_employee_id, technician_name = v_name
   WHERE id = p_work_order_id;

  RETURN jsonb_build_object(
    'technician_name', v_name,
    'changed', v_previous IS DISTINCT FROM p_employee_id,
    'has_whatsapp', v_has_whatsapp
  );
END;
$$;
REVOKE ALL ON FUNCTION public.assign_fm_work_order(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assign_fm_work_order(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.wo_assign_bot_claim(p_limit int DEFAULT 5)
RETURNS TABLE(
  notification_id uuid, claim_token uuid, work_order_id uuid, kind text, recipient text,
  wo_no text, technician_name text, site_name text, location text, service_type text,
  priority text, problem_reported text, scheduled_date date, attempts int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled timestamptz;
BEGIN
  -- (a) stale sending -> uncertain (token kept so a late report still resolves)
  UPDATE public.wo_assignment_notifications n
     SET status = 'uncertain', updated_at = now(),
         last_error = coalesce(n.last_error, 'stale sending claim')
   WHERE n.status = 'sending' AND n.claimed_at < now() - interval '10 minutes';

  -- (b) posting disabled
  SELECT s.posting_enabled_at INTO v_enabled FROM public.wo_assignment_notification_settings s WHERE s.id;
  IF v_enabled IS NULL THEN
    RETURN;
  END IF;

  -- (c) queued before posting was enabled -> skipped
  UPDATE public.wo_assignment_notifications n
     SET status = 'skipped', last_error = 'queued_before_enable', updated_at = now()
   WHERE n.status = 'pending' AND n.created_at < v_enabled;

  -- (d) worker no longer assigned (reassigned or cleared before sending) -> skipped
  UPDATE public.wo_assignment_notifications n
     SET status = 'skipped', last_error = 'reassigned', updated_at = now()
    FROM public.fm_work_orders w
   WHERE n.work_order_id = w.id AND n.status = 'pending'
     AND w.technician_id IS DISTINCT FROM n.employee_id;

  -- (e) claim
  RETURN QUERY
  WITH picked AS (
    SELECT n.id
      FROM public.wo_assignment_notifications n
     WHERE n.status = 'pending'
       AND coalesce(n.next_attempt_at, '-infinity'::timestamptz) <= now()
     ORDER BY n.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.wo_assignment_notifications n
       SET status = 'sending', claimed_at = now(), claim_token = gen_random_uuid(),
           attempts = n.attempts + 1, updated_at = now()
      FROM picked
     WHERE n.id = picked.id
    RETURNING n.id, n.claim_token, n.work_order_id, n.kind, n.recipient, n.attempts, n.created_at
  )
  SELECT u.id, u.claim_token, u.work_order_id, u.kind, u.recipient,
         w.wo_no, w.technician_name, c.site_name, w.location, w.service_type,
         w.priority, w.problem_reported, w.scheduled_date, u.attempts
    FROM upd u
    JOIN public.fm_work_orders w ON w.id = u.work_order_id
    LEFT JOIN public.fm_contracts c ON c.id = w.contract_id
   ORDER BY u.created_at;
END;
$$;

-- Outcomes: sent | retry (nothing went out) | uncertain (may have gone out; never retried)
--         | invalid (permanent, e.g. number not on WhatsApp -> failed).
CREATE OR REPLACE FUNCTION public.wo_assign_bot_report(
  p_id uuid, p_claim_token uuid, p_outcome text,
  p_wa_message_id text DEFAULT NULL, p_error text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.wo_assignment_notifications%ROWTYPE;
  v_backoff interval;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','retry','uncertain','invalid') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  SELECT * INTO r FROM public.wo_assignment_notifications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_not_found';
  END IF;
  IF r.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'claim_token_mismatch';
  END IF;

  IF p_outcome = 'sent' THEN
    IF r.status IN ('sending','uncertain') THEN
      UPDATE public.wo_assignment_notifications
         SET status = 'sent', sent_at = now(), wa_message_id = p_wa_message_id,
             last_error = NULL, updated_at = now()
       WHERE id = p_id;
      RETURN 'sent';
    END IF;
  ELSIF p_outcome = 'uncertain' THEN
    IF r.status = 'sending' THEN
      UPDATE public.wo_assignment_notifications
         SET status = 'uncertain', last_error = p_error, updated_at = now()
       WHERE id = p_id;
      RETURN 'uncertain';
    END IF;
  ELSIF p_outcome = 'invalid' THEN
    IF r.status IN ('sending','uncertain') THEN
      UPDATE public.wo_assignment_notifications
         SET status = 'failed', last_error = p_error, updated_at = now()
       WHERE id = p_id;
      RETURN 'failed';
    END IF;
  ELSE -- retry (sending, or uncertain = never-sent recovery)
    IF r.status IN ('sending','uncertain') THEN
      IF r.attempts >= 5 THEN
        UPDATE public.wo_assignment_notifications
           SET status = 'failed', last_error = p_error, updated_at = now()
         WHERE id = p_id;
        RETURN 'failed';
      END IF;
      v_backoff := CASE r.attempts
        WHEN 1 THEN interval '1 minute'
        WHEN 2 THEN interval '5 minutes'
        WHEN 3 THEN interval '15 minutes'
        ELSE interval '60 minutes' END;
      UPDATE public.wo_assignment_notifications
         SET status = 'pending', next_attempt_at = now() + v_backoff,
             last_error = p_error, updated_at = now()
       WHERE id = p_id;
      RETURN 'pending';
    END IF;
  END IF;

  RETURN r.status; -- disallowed transition: no change
END;
$$;

REVOKE ALL ON FUNCTION public.wo_assign_bot_claim(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.wo_assign_bot_report(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wo_assign_bot_claim(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.wo_assign_bot_report(uuid, uuid, text, text, text) TO service_role;
