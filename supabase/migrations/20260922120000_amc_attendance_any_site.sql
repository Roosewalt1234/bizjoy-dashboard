-- AMC contracts get the same coordinate columns fm_contracts already has.
alter table public.contracts
  add column if not exists site_lat numeric,
  add column if not exists site_lng numeric;

-- attendance_logs.contract_id is FK'd specifically to fm_contracts and
-- can't be retargeted to conditionally point at either fm_contracts or
-- contracts. A second, parallel reference plus a discriminator column
-- lets one row point at either, without touching the existing FM path
-- at all.
alter table public.attendance_logs
  add column if not exists amc_contract_id uuid references public.contracts(id),
  add column if not exists site_type text;

-- AMC mirror of fn_within_geofence — same 150m radius, same Haversine
-- helper (already table-agnostic, reused as-is), just reading from
-- contracts instead of fm_contracts.
create or replace function public.fn_within_amc_geofence(
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
  from contracts where id = p_contract_id;

  if v_site_lat is null or v_site_lng is null then
    return false;
  end if;

  return fn_geofence_distance_m(p_lat, p_lng, v_site_lat, v_site_lng) <= 150;
end;
$$;

-- AMC mirror of check_geofence_distance — same UX-convenience role (the
-- mobile app calls this to pick the right site and show a friendly
-- distance message); fn_within_amc_geofence above is the actual
-- enforcement, via the trigger below.
create or replace function public.check_amc_geofence_distance(
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
  from contracts where id = p_contract_id;

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

grant execute on function public.check_amc_geofence_distance(uuid, numeric, numeric) to authenticated;

-- Extends the existing enforcement trigger (previously FM-only) to
-- validate against the AMC function when site_type = 'AMC'. Rows with
-- any source other than 'mobile_app_geo' are still untouched, exactly
-- as before. A null/unset site_type is treated as 'FM' so any
-- already-queued local event synced from an app build that predates
-- this feature (and so never sets site_type) keeps working exactly as
-- it does today.
create or replace function public.trg_attendance_logs_geofence() returns trigger
language plpgsql
as $$
begin
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
