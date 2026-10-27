-- FM work orders: record who created each work order, separately from who it is assigned to.
-- Snags used to keep their reporter only in technician_id/technician_name, so assigning a snag
-- overwrote the reporter. created_by_* now holds the creator; technician_* means "Assigned to".

ALTER TABLE public.fm_work_orders
  ADD COLUMN IF NOT EXISTS created_by_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by_name text;

-- Backfill from the audit log's INSERT row. Snags: the reporter the mobile app wrote into
-- technician_* at insert time (this restores reporters overwritten by later assignments).
-- Others: the employee linked to the inserting user, else the audited user name.
WITH first_insert AS (
  SELECT DISTINCT ON (a.record_id) a.record_id, a.user_id, a.user_name, a.new_data
  FROM public.audit_log a
  WHERE a.table_name = 'fm_work_orders' AND a.action = 'INSERT'
  ORDER BY a.record_id, a.changed_at
), creator AS (
  SELECT wo.id,
    CASE WHEN coalesce(wo.notes, '') LIKE '[SNAG REPORT]%'
      THEN nullif(fi.new_data->>'technician_id', '')::uuid
      ELSE e.id END AS emp_id,
    CASE WHEN coalesce(wo.notes, '') LIKE '[SNAG REPORT]%'
      THEN coalesce(nullif(fi.new_data->>'technician_name', ''),
                    trim(substring(wo.notes FROM 'Reported by: ([^|\n]+)')))
      ELSE coalesce(nullif(trim(coalesce(e.full_name, concat_ws(' ', e.first_name, e.last_name))), ''), fi.user_name) END AS emp_name
  FROM public.fm_work_orders wo
  LEFT JOIN first_insert fi ON fi.record_id = wo.id
  LEFT JOIN public.employees e ON e.auth_user_id = fi.user_id
)
UPDATE public.fm_work_orders wo
SET created_by_id = c.emp_id, created_by_name = c.emp_name
FROM creator c
WHERE c.id = wo.id AND wo.created_by_name IS NULL;

-- New rows: snags take the reporter from technician_*; dashboard-created rows take the
-- signed-in user's employee record, else their profile name or email. Never editable afterwards.
CREATE OR REPLACE FUNCTION app_private.set_fm_work_order_created_by()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.created_by_id := OLD.created_by_id;
    NEW.created_by_name := OLD.created_by_name;
    RETURN NEW;
  END IF;

  IF coalesce(NEW.notes, '') LIKE '[SNAG REPORT]%' THEN
    NEW.created_by_id := NEW.technician_id;
    NEW.created_by_name := NEW.technician_name;
    RETURN NEW;
  END IF;

  SELECT e.id, nullif(trim(coalesce(e.full_name, concat_ws(' ', e.first_name, e.last_name))), '')
    INTO NEW.created_by_id, NEW.created_by_name
  FROM public.employees e
  WHERE auth.uid() IS NOT NULL AND e.auth_user_id = auth.uid()
  LIMIT 1;

  IF NEW.created_by_name IS NULL AND auth.uid() IS NOT NULL THEN
    SELECT coalesce(nullif(p.display_name, ''), p.email) INTO NEW.created_by_name
    FROM public.profiles p WHERE p.id = auth.uid();
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION app_private.set_fm_work_order_created_by() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_set_fm_work_order_created_by ON public.fm_work_orders;
CREATE TRIGGER trg_set_fm_work_order_created_by
  BEFORE INSERT OR UPDATE ON public.fm_work_orders
  FOR EACH ROW EXECUTE FUNCTION app_private.set_fm_work_order_created_by();
