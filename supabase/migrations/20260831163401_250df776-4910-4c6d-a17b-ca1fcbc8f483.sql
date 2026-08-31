-- Add section_id self-reference to fm_cleaning_areas (used to link utility rooms to their parent section)
ALTER TABLE public.fm_cleaning_areas
  ADD COLUMN section_id uuid REFERENCES public.fm_cleaning_areas(id) ON DELETE SET NULL;
CREATE INDEX idx_fm_cleaning_areas_section ON public.fm_cleaning_areas(section_id);

-- Add area_id to fm_cleaning_schedules (used to schedule a specific cleaning area/floor)
ALTER TABLE public.fm_cleaning_schedules
  ADD COLUMN area_id uuid REFERENCES public.fm_cleaning_areas(id) ON DELETE CASCADE;
ALTER TABLE public.fm_cleaning_schedules
  ALTER COLUMN area_type DROP NOT NULL;
CREATE INDEX idx_fm_cleaning_schedules_area ON public.fm_cleaning_schedules(area_id);