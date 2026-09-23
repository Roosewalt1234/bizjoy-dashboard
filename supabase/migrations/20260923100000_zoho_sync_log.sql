-- Records one row per sync run so a broken/stale sync is visible instead
-- of silently going stale. Locked down (RLS enabled, no policies) since
-- only the service-role Edge Function writes to it and there's no
-- dashboard UI reading it yet (a future task, per the design spec).
create table if not exists public.zoho_sync_log (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null,
  finished_at timestamptz,
  quotes_found integer not null default 0,
  quotes_synced integer not null default 0,
  quotes_failed integer not null default 0,
  error_summary text,
  created_at timestamptz not null default now()
);

alter table public.zoho_sync_log enable row level security;
