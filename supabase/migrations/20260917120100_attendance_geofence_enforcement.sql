-- Haversine distance in meters between two lat/lng points. Immutable
-- and side-effect free, used by both the read-only distance check below
-- and the enforcement trigger.
create or replace function public.fn_geofence_distance_m(
  lat1 numeric, lng1 numeric, lat2 numeric, lng2 numeric
) returns numeric
language sql
immutable
as $$
  select 6371000 * acos(
    least(1::double precision, greatest(-1::double precision,
      cos(radians(lat1::double precision)) * cos(radians(lat2::double precision))
        * cos(radians(lng2::double precision) - radians(lng1::double precision))
      + sin(radians(lat1::double precision)) * sin(radians(lat2::double precision))
    ))
  );
$$;

-- True only when the contract has coordinates configured AND the given
-- point is within 150m of them. Used by the enforcement trigger below —
-- this is the actual security boundary, not just app-side UX.
create or replace function public.fn_within_geofence(
  p_contract_id uuid,
  p_lat numeric,
  p_lng numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_lat numeric;
  v_site_lng numeric;
begin
  if p_lat is null or p_lng is null or p_contract_id is null then
    return false;
  end if;

  select site_lat, site_lng into v_site_lat, v_site_lng
  from fm_contracts where id = p_contract_id;

  if v_site_lat is null or v_site_lng is null then
    return false;
  end if;

  return fn_geofence_distance_m(p_lat, p_lng, v_site_lat, v_site_lng) <= 150;
end;
$$;

-- Read-only helper the mobile app calls BEFORE attempting a check-in/out,
-- to pick which of the employee's sites they're at and show a friendly
-- distance-based error message. This is pure UX — it does not gate
-- anything by itself. The trigger below is what actually enforces this.
create or replace function public.check_geofence_distance(
  p_contract_id uuid,
  p_lat numeric,
  p_lng numeric
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_site_lat numeric;
  v_site_lng numeric;
  v_distance numeric;
begin
  select site_lat, site_lng into v_site_lat, v_site_lng
  from fm_contracts where id = p_contract_id;

  if v_site_lat is null or v_site_lng is null then
    return jsonb_build_object('valid', false, 'distance_m', null, 'reason', 'site_not_configured');
  end if;

  v_distance := fn_geofence_distance_m(p_lat, p_lng, v_site_lat, v_site_lng);

  return jsonb_build_object(
    'valid', v_distance <= 150,
    'distance_m', round(v_distance),
    'reason', case when v_distance <= 150 then 'within_range' else 'out_of_range' end
  );
end;
$$;

grant execute on function public.check_geofence_distance(uuid, numeric, numeric) to authenticated;

-- Enforcement: rejects any INSERT that sets check_in, or UPDATE that
-- sets check_out, on a geofenced mobile-app row (source =
-- 'mobile_app_geo') unless the captured lat/lng are within range of the
-- row's contract. Rows from any other source (e.g. the existing
-- 'nfc_app' diagnostic probe, or a future admin manual-entry path) are
-- completely untouched by this trigger.
create or replace function public.trg_attendance_logs_geofence() returns trigger
language plpgsql
as $$
begin
  if NEW.source is distinct from 'mobile_app_geo' then
    return NEW;
  end if;

  if TG_OP = 'INSERT' and NEW.check_in is not null then
    if NEW.check_in_lat is null or NEW.check_in_lng is null
       or not fn_within_geofence(NEW.contract_id, NEW.check_in_lat, NEW.check_in_lng) then
      raise exception 'Check-in rejected: location not verified within site geofence'
        using errcode = 'P0001';
    end if;
  end if;

  if TG_OP = 'UPDATE' and OLD.check_out is null and NEW.check_out is not null then
    if NEW.check_out_lat is null or NEW.check_out_lng is null
       or not fn_within_geofence(NEW.contract_id, NEW.check_out_lat, NEW.check_out_lng) then
      raise exception 'Check-out rejected: location not verified within site geofence'
        using errcode = 'P0001';
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists attendance_logs_geofence_trigger on public.attendance_logs;
create trigger attendance_logs_geofence_trigger
  before insert or update on public.attendance_logs
  for each row execute function public.trg_attendance_logs_geofence();
