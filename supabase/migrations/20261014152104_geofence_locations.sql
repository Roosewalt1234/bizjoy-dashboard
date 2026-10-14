-- Standalone attendance locations (office, warehouse, shop, bank...) that are not tied to a contract.
create table if not exists public.geofence_locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  location_type text not null default 'Office',
  description text,
  latitude numeric not null check (latitude between -90 and 90),
  longitude numeric not null check (longitude between -180 and 180),
  radius_m integer not null default 150 check (radius_m between 20 and 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.geofence_locations enable row level security;

-- Staff apps need to read the list to find where they are; only admins change it.
create policy geofence_locations_select on public.geofence_locations
  for select to authenticated using (true);
create policy geofence_locations_insert on public.geofence_locations
  for insert to authenticated with check (app_private.has_role(auth.uid(), 'admin'::app_role));
create policy geofence_locations_update on public.geofence_locations
  for update to authenticated
  using (app_private.has_role(auth.uid(), 'admin'::app_role))
  with check (app_private.has_role(auth.uid(), 'admin'::app_role));
create policy geofence_locations_delete on public.geofence_locations
  for delete to authenticated using (app_private.has_role(auth.uid(), 'admin'::app_role));

create trigger geofence_locations_updated_at before update on public.geofence_locations
  for each row execute function set_updated_at();
create trigger audit_geofence_locations after insert or delete or update on public.geofence_locations
  for each row execute function log_audit_event();

alter table public.attendance_logs
  add column if not exists location_id uuid references public.geofence_locations(id) on delete set null;

-- Distance check for the mobile app (same shape as check_geofence_distance).
create or replace function public.check_location_geofence_distance(p_location_id uuid, p_lat numeric, p_lng numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lat numeric;
  v_lng numeric;
  v_radius integer;
  v_distance numeric;
begin
  select latitude, longitude, radius_m into v_lat, v_lng, v_radius
  from geofence_locations where id = p_location_id and active;

  if v_lat is null or v_lng is null then
    return jsonb_build_object('valid', false, 'distance_m', null, 'reason', 'site_not_configured');
  end if;

  v_distance := fn_geofence_distance_m(p_lat, p_lng, v_lat, v_lng);

  return jsonb_build_object(
    'valid', v_distance <= v_radius,
    'distance_m', round(v_distance),
    'reason', case when v_distance <= v_radius then 'within_range' else 'out_of_range' end
  );
end;
$function$;

create or replace function public.fn_within_location_geofence(p_location_id uuid, p_lat numeric, p_lng numeric)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lat numeric;
  v_lng numeric;
  v_radius integer;
begin
  if p_lat is null or p_lng is null or p_location_id is null then
    return false;
  end if;

  select latitude, longitude, radius_m into v_lat, v_lng, v_radius
  from geofence_locations where id = p_location_id and active;

  if v_lat is null or v_lng is null then
    return false;
  end if;

  return fn_geofence_distance_m(p_lat, p_lng, v_lat, v_lng) <= v_radius;
end;
$function$;

-- The attendance trigger now also accepts check-in/out at a configured location.
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

  if TG_OP = 'UPDATE' and OLD.check_out is null and NEW.check_out is not null then
    if NEW.check_out_lat is null or NEW.check_out_lng is null then
      raise exception 'Check-out rejected: location not verified within site geofence'
        using errcode = 'P0001';
    end if;
    if NEW.site_type = 'LOCATION' then
      if not fn_within_location_geofence(NEW.location_id, NEW.check_out_lat, NEW.check_out_lng) then
        raise exception 'Check-out rejected: location not verified within site geofence'
          using errcode = 'P0001';
      end if;
    elsif coalesce(NEW.site_type, 'FM') = 'AMC' then
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
$function$;

-- An office/shop visit is an 8-hour day like AMC, not a 12-hour FM shift.
create or replace function public.fn_auto_checkout_overdue_attendance()
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update attendance_logs
  set
    check_out = check_in + case
      when coalesce(site_type, 'FM') in ('AMC', 'LOCATION') then interval '8 hours'
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
      when coalesce(site_type, 'FM') in ('AMC', 'LOCATION') then interval '8 hours'
      else interval '12 hours'
    end;
end;
$function$;
