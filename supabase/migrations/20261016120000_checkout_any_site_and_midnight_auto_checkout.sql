-- Check-out at any registered site + midnight auto-checkout.
--
-- 1. AMC (and BOTH/FM) staff often check in at one site and finish the day at
--    another. Check-out is now accepted inside ANY registered geofence (any FM
--    site, any active AMC site, any active Geofencing location) instead of only
--    the site checked into. The check-in site columns stay untouched; the
--    check-out site's name is recorded in check_out_site.
-- 2. Auto-checkout no longer closes a shift the moment it passes 8/12 hours
--    (that cut off day staff still working). Day shifts (check-in before 14:00
--    UAE) are closed at midnight UAE; later (night) check-ins keep the old
--    timing of 12 hours after check-in. Every auto-closed shift is recorded
--    as 8 hours.

alter table public.attendance_logs
  add column if not exists check_out_site text;

-- True when the point is inside any registered geofence.
create or replace function public.fn_within_any_geofence(p_lat numeric, p_lng numeric)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_lat is not null and p_lng is not null and (
    exists (
      select 1 from fm_contracts f
      where f.site_lat is not null and f.site_lng is not null
        and fn_geofence_distance_m(p_lat, p_lng, f.site_lat, f.site_lng) <= 150
    )
    or exists (
      select 1 from contracts c
      where c.status = 'Active' and c.site_lat is not null and c.site_lng is not null
        and fn_geofence_distance_m(p_lat, p_lng, c.site_lat, c.site_lng) <= 150
    )
    or exists (
      select 1 from geofence_locations g
      where g.active and g.latitude is not null and g.longitude is not null
        and fn_geofence_distance_m(p_lat, p_lng, g.latitude, g.longitude) <= g.radius_m
    )
  );
$$;

create or replace function public.trg_attendance_logs_geofence()
returns trigger
language plpgsql
as $function$
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
    if NEW.site_type = 'LOCATION' then
      if not fn_within_location_geofence(NEW.location_id, NEW.check_in_lat, NEW.check_in_lng) then
        raise exception 'Check-in rejected: location not verified within site geofence'
          using errcode = 'P0001';
      end if;
    elsif coalesce(NEW.site_type, 'FM') = 'AMC' then
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

  -- Check-out may happen at any registered site, not just the check-in site.
  if TG_OP = 'UPDATE' and OLD.check_out is null and NEW.check_out is not null then
    if not fn_within_any_geofence(NEW.check_out_lat, NEW.check_out_lng) then
      raise exception 'Check-out rejected: location not verified within a registered site geofence'
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$function$;

create or replace function public.fn_auto_checkout_overdue_attendance()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update attendance_logs
  set
    check_out = check_in + interval '8 hours',
    auto_checked_out = true,
    remarks = case
      when remarks is null or remarks = '' then 'Auto checked-out - no tap-out recorded'
      else remarks || ' | Auto checked-out - no tap-out recorded'
    end,
    updated_at = now()
  where check_in is not null
    and check_out is null
    and now() >= case
      -- Day shift: close at the midnight (UAE) that ends the check-in day.
      when extract(hour from check_in at time zone 'Asia/Dubai') < 14
        then (((check_in at time zone 'Asia/Dubai')::date + 1)::timestamp at time zone 'Asia/Dubai')
      -- Night shift: unchanged timing, 12 hours after check-in.
      else check_in + interval '12 hours'
    end;
end;
$function$;
