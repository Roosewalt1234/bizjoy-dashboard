-- Reconcile missing snag notifications, recover never-sent retries, warn on trigger failure.

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
    RAISE WARNING 'queue_snag_notification failed: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION app_private.queue_snag_notification() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION app_private.snag_reconcile_missing()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_enabled timestamptz;
  v_count int;
BEGIN
  SELECT s.posting_enabled_at INTO v_enabled FROM public.snag_notification_settings s WHERE s.id;
  IF v_enabled IS NULL THEN
    RETURN 0;
  END IF;

  INSERT INTO public.snag_notifications (work_order_id)
  SELECT w.id
    FROM public.fm_work_orders w
   WHERE w.notes LIKE '[SNAG REPORT]%'
     AND w.before_photo_path IS NOT NULL
     AND w.created_at >= v_enabled
     AND NOT EXISTS (SELECT 1 FROM public.snag_notifications n WHERE n.work_order_id = w.id)
  ON CONFLICT (work_order_id) DO NOTHING;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION app_private.snag_reconcile_missing() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION app_private.snag_reconcile_missing() TO service_role;

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
  -- (0) re-queue snag work orders whose notification row is missing
  PERFORM app_private.snag_reconcile_missing();

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
  ELSE -- retry (sending, or uncertain = never-sent recovery)
    IF r.status IN ('sending','uncertain') THEN
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
