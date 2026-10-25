-- Snag WhatsApp alerts: CRM-side notification queue consumed by an Edge Function (service_role) for Anna's bot.

CREATE TABLE public.snag_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_order_id uuid NOT NULL UNIQUE REFERENCES public.fm_work_orders(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sending','sent','failed','uncertain','skipped')),
  attempts int NOT NULL DEFAULT 0,
  next_attempt_at timestamptz,
  claimed_at timestamptz,
  claim_token uuid,
  sent_at timestamptz,
  wa_message_id text,
  last_error text,
  destination text NOT NULL DEFAULT 'Schedule- Fizfix',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.snag_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY snag_notifications_select ON public.snag_notifications
  FOR SELECT USING (app_private.can(auth.uid(), 'service', 'view'));

CREATE TABLE public.snag_notification_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  posting_enabled_at timestamptz
);
ALTER TABLE public.snag_notification_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY snag_notification_settings_select ON public.snag_notification_settings
  FOR SELECT USING (app_private.can(auth.uid(), 'service', 'view'));
INSERT INTO public.snag_notification_settings (id, posting_enabled_at) VALUES (true, NULL);

REVOKE ALL ON public.snag_notifications FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.snag_notification_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.snag_notifications TO service_role;
GRANT ALL ON public.snag_notification_settings TO service_role;

CREATE UNIQUE INDEX fm_work_orders_before_photo_path_key
  ON public.fm_work_orders (before_photo_path) WHERE before_photo_path IS NOT NULL;

-- Trigger: must never make the work order insert fail.
CREATE OR REPLACE FUNCTION app_private.queue_snag_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  BEGIN
    IF NEW.notes LIKE '[SNAG REPORT]%' AND NEW.before_photo_path IS NOT NULL THEN
      INSERT INTO public.snag_notifications (work_order_id)
      VALUES (NEW.id)
      ON CONFLICT (work_order_id) DO NOTHING;
    END IF;
  EXCEPTION WHEN others THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.queue_snag_notification() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_queue_snag_notification
  AFTER INSERT ON public.fm_work_orders
  FOR EACH ROW EXECUTE FUNCTION app_private.queue_snag_notification();

CREATE OR REPLACE FUNCTION public.snag_bot_claim(p_limit int DEFAULT 5)
RETURNS TABLE(
  notification_id uuid, claim_token uuid, work_order_id uuid, wo_no text,
  technician_name text, site_name text, location text, service_type text,
  priority text, problem_reported text, reported_at timestamptz,
  photo_path text, attempts int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled timestamptz;
BEGIN
  -- (a) stale sending -> uncertain (token kept so a late report still resolves)
  UPDATE public.snag_notifications n
     SET status = 'uncertain', updated_at = now(),
         last_error = coalesce(n.last_error, 'stale sending claim')
   WHERE n.status = 'sending' AND n.claimed_at < now() - interval '10 minutes';

  -- (b) posting disabled
  SELECT s.posting_enabled_at INTO v_enabled FROM public.snag_notification_settings s WHERE s.id;
  IF v_enabled IS NULL THEN
    RETURN;
  END IF;

  -- (c) pre-enable work orders are skipped
  UPDATE public.snag_notifications n
     SET status = 'skipped', updated_at = now()
    FROM public.fm_work_orders w
   WHERE n.work_order_id = w.id AND n.status = 'pending' AND w.created_at < v_enabled;

  -- (d) claim
  RETURN QUERY
  WITH picked AS (
    SELECT n.id
      FROM public.snag_notifications n
     WHERE n.status = 'pending'
       AND coalesce(n.next_attempt_at, '-infinity'::timestamptz) <= now()
     ORDER BY n.created_at
     LIMIT p_limit
     FOR UPDATE SKIP LOCKED
  ), upd AS (
    UPDATE public.snag_notifications n
       SET status = 'sending', claimed_at = now(), claim_token = gen_random_uuid(),
           attempts = n.attempts + 1, updated_at = now()
      FROM picked
     WHERE n.id = picked.id
    RETURNING n.id, n.claim_token, n.work_order_id, n.attempts
  )
  SELECT u.id, u.claim_token, u.work_order_id, w.wo_no, w.technician_name,
         c.site_name, w.location, w.service_type, w.priority, w.problem_reported,
         w.reported_at, w.before_photo_path, u.attempts
    FROM upd u
    JOIN public.fm_work_orders w ON w.id = u.work_order_id
    LEFT JOIN public.fm_contracts c ON c.id = w.contract_id
   ORDER BY w.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.snag_bot_report(
  p_id uuid, p_claim_token uuid, p_outcome text,
  p_wa_message_id text DEFAULT NULL, p_error text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r public.snag_notifications%ROWTYPE;
  v_backoff interval;
BEGIN
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent','retry','uncertain') THEN
    RAISE EXCEPTION 'invalid_outcome';
  END IF;

  SELECT * INTO r FROM public.snag_notifications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'notification_not_found';
  END IF;
  IF r.claim_token IS DISTINCT FROM p_claim_token THEN
    RAISE EXCEPTION 'claim_token_mismatch';
  END IF;

  IF p_outcome = 'sent' THEN
    IF r.status IN ('sending','uncertain') THEN
      UPDATE public.snag_notifications
         SET status = 'sent', sent_at = now(), wa_message_id = p_wa_message_id,
             last_error = NULL, updated_at = now()
       WHERE id = p_id;
      RETURN 'sent';
    END IF;
  ELSIF p_outcome = 'uncertain' THEN
    IF r.status = 'sending' THEN
      UPDATE public.snag_notifications
         SET status = 'uncertain', last_error = p_error, updated_at = now()
       WHERE id = p_id;
      RETURN 'uncertain';
    END IF;
  ELSE -- retry
    IF r.status = 'sending' THEN
      IF r.attempts >= 5 THEN
        UPDATE public.snag_notifications
           SET status = 'failed', last_error = p_error, updated_at = now()
         WHERE id = p_id;
        RETURN 'failed';
      END IF;
      v_backoff := CASE r.attempts
        WHEN 1 THEN interval '1 minute'
        WHEN 2 THEN interval '5 minutes'
        WHEN 3 THEN interval '15 minutes'
        ELSE interval '60 minutes' END;
      UPDATE public.snag_notifications
         SET status = 'pending', next_attempt_at = now() + v_backoff,
             last_error = p_error, updated_at = now()
       WHERE id = p_id;
      RETURN 'pending';
    END IF;
  END IF;

  RETURN r.status; -- disallowed transition: no change
END;
$$;

REVOKE ALL ON FUNCTION public.snag_bot_claim(int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.snag_bot_report(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.snag_bot_claim(int) TO service_role;
GRANT EXECUTE ON FUNCTION public.snag_bot_report(uuid, uuid, text, text, text) TO service_role;
