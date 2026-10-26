-- Snag WhatsApp alerts now go to "Operations - 48 Parkside Maintenance" (was "Schedule- Fizfix").
-- The destination is hard-wired in Anna's snag-alerts.mjs; this column only records it.
-- Existing rows keep the group they were actually sent to.
ALTER TABLE public.snag_notifications
  ALTER COLUMN destination SET DEFAULT 'Operations - 48 Parkside Maintenance';
