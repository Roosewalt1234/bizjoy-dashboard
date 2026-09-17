-- One-time data correction: every attendance_logs row written by the mobile
-- app via the old getUaeTimestampForDb() helper (source = 'nfc_app', the
-- source value used before this same fix also introduced 'mobile_app_geo')
-- was stored 4 hours LATE. The helper computed the correct Dubai wall-clock
-- time but wrote it as an offset-less string into a `timestamp with time
-- zone` column under a UTC database session, so Postgres silently treated
-- the Dubai digits as if they were already UTC. Confirmed live before this
-- migration: an 11:16 AM Dubai check-in was stored as 11:16 UTC (= 3:16 PM
-- Dubai) instead of 7:16 UTC (= 11:16 AM Dubai). This shifts every affected
-- row back 4 hours to its true instant. See the code fix in
-- Fiz-fix-mobile-app/src/lib/uaeTime.ts (getUaeTimestampForDb) for the
-- going-forward correction.
update attendance_logs
set
  check_in = check_in - interval '4 hours',
  check_out = check_out - interval '4 hours',
  created_at = created_at - interval '4 hours',
  updated_at = updated_at - interval '4 hours'
where source = 'nfc_app';
