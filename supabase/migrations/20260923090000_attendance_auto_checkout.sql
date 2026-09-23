-- New flag: true when a row's check_out was filled in automatically by
-- the scheduled job below, rather than a real tap-out or manual edit.
alter table public.attendance_logs
  add column if not exists auto_checked_out boolean not null default false;

-- Closes out any attendance row left open past its shift window: FM rows
-- get 12 hours from check_in, AMC rows get 8 hours. The recorded check_out
-- is always the exact deadline instant (check_in + 12h/8h), never "now" -
-- so it stays correct even if this job runs a few minutes late.
create or replace function public.fn_auto_checkout_overdue_attendance()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update attendance_logs
  set
    check_out = check_in + case
      when coalesce(site_type, 'FM') = 'AMC' then interval '8 hours'
      else interval '12 hours'
    end,
    auto_checked_out = true,
    remarks = case
      when remarks is null or remarks = '' then 'Auto checked-out - no tap-out recorded'
      else remarks || ' | Auto checked-out - no tap-out recorded'
    end,
    updated_at = now()
  where check_in is not null
    and check_out is null
    and now() >= check_in + case
      when coalesce(site_type, 'FM') = 'AMC' then interval '8 hours'
      else interval '12 hours'
    end;
end;
$$;

-- Existing geofence trigger gets one new early-exit: an update that's
-- setting auto_checked_out from false to true is the scheduled job above,
-- which by definition has no real GPS reading to validate against - skip
-- geofence enforcement entirely for that specific kind of update. Every
-- other path (real check-ins, real check-outs from the mobile app) is
-- validated exactly as before.
create or replace function public.trg_attendance_logs_geofence() returns trigger
language plpgsql
as $$
begin
  if TG_OP = 'UPDATE' and NEW.auto_checked_out and not coalesce(OLD.auto_checked_out, false) then
    return NEW;
  end if;

  if NEW.source is distinct from 'mobile_app_geo' then
    return NEW;
  end if;

  if TG_OP = 'INSERT' and NEW.check_in is not null then
    if NEW.check_in_lat is null or NEW.check_in_lng is null then
      raise exception 'Check-in rejected: location not verified within site geofence'
        using errcode = 'P0001';
    end if;
    if coalesce(NEW.site_type, 'FM') = 'AMC' then
      if not fn_within_amc_geofence(NEW.amc_contract_id, NEW.check_in_lat, NEW.check_in_lng) then
        raise exception 'Check-in rejected: location not verified within site geofence'
          using errcode = 'P0001';
      end if;
    else
      if not fn_within_geofence(NEW.contract_id, NEW.check_in_lat, NEW.check_in_lng) then
        raise exception 'Check-in rejected: location not verified within site geofence'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  if TG_OP = 'UPDATE' and OLD.check_out is null and NEW.check_out is not null then
    if NEW.check_out_lat is null or NEW.check_out_lng is null then
      raise exception 'Check-out rejected: location not verified within site geofence'
        using errcode = 'P0001';
    end if;
    if coalesce(NEW.site_type, 'FM') = 'AMC' then
      if not fn_within_amc_geofence(NEW.amc_contract_id, NEW.check_out_lat, NEW.check_out_lng) then
        raise exception 'Check-out rejected: location not verified within site geofence'
          using errcode = 'P0001';
      end if;
    else
      if not fn_within_geofence(NEW.contract_id, NEW.check_out_lat, NEW.check_out_lng) then
        raise exception 'Check-out rejected: location not verified within site geofence'
          using errcode = 'P0001';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

-- Enable pg_cron (available on this project, not yet enabled) and
-- schedule the job every 5 minutes. cron.schedule upserts by job name, so
-- re-running this migration is safe.
create extension if not exists pg_cron;

select cron.schedule(
  'auto-checkout-overdue-attendance',
  '*/5 * * * *',
  $$select public.fn_auto_checkout_overdue_attendance();$$
);
