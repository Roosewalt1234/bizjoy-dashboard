-- Snag notification queue tests. Everything rolls back via the final RAISE EXCEPTION.
-- Run with Supabase execute_sql; expected error text: snag_tests_passed
DO $$
DECLARE
  wo1 uuid; wo2 uuid; wo3 uuid; wo4 uuid;
  n int; sn text; cid uuid; csite text; wid uuid; st text; tok uuid; tok2 uuid; nid uuid; nid2 uuid; r record; na timestamptz;
BEGIN
  -- reset: no real queue rows should interfere
  DELETE FROM public.snag_notifications;
  UPDATE public.snag_notification_settings SET posting_enabled_at = NULL;

  INSERT INTO public.fm_work_orders(notes, before_photo_path, status)
    VALUES ('[SNAG REPORT] test', 't/snags/a.jpg', 'Open') RETURNING id INTO wo1;
  SELECT count(*) INTO n FROM public.snag_notifications WHERE work_order_id = wo1 AND status = 'pending';
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: expected 1 pending row, got %', n; END IF;

  BEGIN
    INSERT INTO public.fm_work_orders(notes, before_photo_path, status)
      VALUES ('[SNAG REPORT] dup', 't/snags/a.jpg', 'Open');
    RAISE EXCEPTION 'FAIL: duplicate photo path accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  INSERT INTO public.fm_work_orders(notes, before_photo_path, status) VALUES ('[SNAG REPORT] nophoto', NULL, 'Open');
  INSERT INTO public.fm_work_orders(notes, before_photo_path, status) VALUES ('regular note', 't/snags/b.jpg', 'Open');
  SELECT count(*) INTO n FROM public.snag_notifications;
  IF n <> 1 THEN RAISE EXCEPTION 'FAIL: non-snag WOs queued, total %', n; END IF;

  SELECT count(*) INTO n FROM public.snag_bot_claim(5);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: claim returned rows while posting disabled'; END IF;

  UPDATE public.snag_notification_settings SET posting_enabled_at = now();
  UPDATE public.fm_work_orders SET created_at = now() - interval '1 hour' WHERE id = wo1;
  INSERT INTO public.fm_work_orders(notes, before_photo_path, status)
    VALUES ('[SNAG REPORT] fresh', 't/snags/c.jpg', 'Open') RETURNING id INTO wo2;

  SELECT count(*), max(c.site_name), max(c.work_order_id::text)::uuid INTO n, sn, wid FROM public.snag_bot_claim(5) c;
  IF wid IS DISTINCT FROM wo2 THEN RAISE EXCEPTION 'FAIL: claim did not return exactly the fresh WO'; END IF;
  IF sn IS NOT NULL THEN RAISE EXCEPTION 'FAIL: site_name should be null without contract, got %', sn; END IF;
  -- re-do properly: claim once and capture
  -- (the call above already claimed wo2; inspect state)
  SELECT status INTO st FROM public.snag_notifications WHERE work_order_id = wo1;
  IF st <> 'skipped' THEN RAISE EXCEPTION 'FAIL: old WO should be skipped, is %', st; END IF;
  SELECT id, claim_token, status, attempts INTO r FROM public.snag_notifications WHERE work_order_id = wo2;
  IF n <> 1 OR r.status <> 'sending' OR r.attempts <> 1 OR r.claim_token IS NULL THEN
    RAISE EXCEPTION 'FAIL: claim state n=% status=% attempts=%', n, r.status, r.attempts;
  END IF;
  nid := r.id; tok := r.claim_token;

  st := public.snag_bot_report(nid, tok, 'retry', NULL, 'x');
  IF st <> 'pending' THEN RAISE EXCEPTION 'FAIL: retry -> %', st; END IF;
  SELECT next_attempt_at INTO na FROM public.snag_notifications WHERE id = nid;
  IF na < now() + interval '50 seconds' OR na > now() + interval '70 seconds' THEN
    RAISE EXCEPTION 'FAIL: backoff not ~1 min: %', na;
  END IF;
  SELECT count(*) INTO n FROM public.snag_bot_claim(5);
  IF n <> 0 THEN RAISE EXCEPTION 'FAIL: claim returned row during backoff'; END IF;

  -- re-claim with new token
  UPDATE public.snag_notifications SET next_attempt_at = now() - interval '1 second' WHERE id = nid;
  SELECT c.claim_token INTO tok2 FROM public.snag_bot_claim(5) c WHERE c.notification_id = nid;
  IF tok2 IS NULL OR tok2 = tok THEN RAISE EXCEPTION 'FAIL: no new token on re-claim'; END IF;
  BEGIN
    PERFORM public.snag_bot_report(nid, tok, 'sent', 'W');
    RAISE EXCEPTION 'FAIL: old token accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM <> 'claim_token_mismatch' THEN RAISE; END IF;
  END;

  -- attempts = 5 then retry -> failed
  UPDATE public.snag_notifications SET attempts = 5 WHERE id = nid;
  st := public.snag_bot_report(nid, tok2, 'retry', NULL, 'boom');
  IF st <> 'failed' THEN RAISE EXCEPTION 'FAIL: expected failed, got %', st; END IF;

  -- sent path
  SELECT id, site_name INTO cid, csite FROM public.fm_contracts WHERE site_name IS NOT NULL LIMIT 1;
  INSERT INTO public.fm_work_orders(notes, before_photo_path, status, contract_id)
    VALUES ('[SNAG REPORT] s', 't/snags/d.jpg', 'Open', cid) RETURNING id INTO wo3;
  SELECT c.notification_id, c.claim_token, c.site_name INTO nid, tok, sn FROM public.snag_bot_claim(5) c WHERE c.work_order_id = wo3;
  IF cid IS NOT NULL AND sn IS DISTINCT FROM csite THEN
    RAISE EXCEPTION 'FAIL: site_name % <> contract site_name %', sn, csite;
  END IF;
  st := public.snag_bot_report(nid, tok, 'sent', 'WAID');
  IF st <> 'sent' THEN RAISE EXCEPTION 'FAIL: sent -> %', st; END IF;
  SELECT * INTO r FROM public.snag_notifications WHERE id = nid;
  IF r.sent_at IS NULL OR r.wa_message_id <> 'WAID' THEN RAISE EXCEPTION 'FAIL: sent fields'; END IF;
  IF public.snag_bot_report(nid, tok, 'retry') <> 'sent' OR public.snag_bot_report(nid, tok, 'uncertain') <> 'sent' THEN
    RAISE EXCEPTION 'FAIL: sent must be terminal';
  END IF;

  -- uncertain then late sent
  INSERT INTO public.fm_work_orders(notes, before_photo_path, status)
    VALUES ('[SNAG REPORT] u', 't/snags/e.jpg', 'Open') RETURNING id INTO wo4;
  SELECT c.notification_id, c.claim_token INTO nid2, tok FROM public.snag_bot_claim(5) c WHERE c.work_order_id = wo4;
  st := public.snag_bot_report(nid2, tok, 'uncertain');
  IF st <> 'uncertain' THEN RAISE EXCEPTION 'FAIL: uncertain -> %', st; END IF;
  st := public.snag_bot_report(nid2, tok, 'sent', 'WAID2');
  IF st <> 'sent' THEN RAISE EXCEPTION 'FAIL: late sent -> %', st; END IF;
  BEGIN
    PERFORM public.snag_bot_report(nid2, tok, 'bogus');
    RAISE EXCEPTION 'FAIL: bogus outcome accepted';
  EXCEPTION WHEN others THEN
    IF SQLERRM LIKE 'FAIL:%' THEN RAISE; END IF;
  END;

  -- stale sending -> uncertain keeping token
  INSERT INTO public.fm_work_orders(notes, before_photo_path, status)
    VALUES ('[SNAG REPORT] stale', 't/snags/f.jpg', 'Open');
  SELECT c.notification_id, c.claim_token INTO nid, tok FROM public.snag_bot_claim(5) c;
  UPDATE public.snag_notifications SET claimed_at = now() - interval '11 minutes' WHERE id = nid;
  PERFORM public.snag_bot_claim(5);
  SELECT * INTO r FROM public.snag_notifications WHERE id = nid;
  IF r.status <> 'uncertain' OR r.claim_token IS DISTINCT FROM tok THEN
    RAISE EXCEPTION 'FAIL: stale handling status=% token kept=%', r.status, (r.claim_token = tok);
  END IF;
  IF public.snag_bot_report(nid, tok, 'sent', 'LATE') <> 'sent' THEN RAISE EXCEPTION 'FAIL: late resolve'; END IF;

  RAISE EXCEPTION 'snag_tests_passed';
END $$;
