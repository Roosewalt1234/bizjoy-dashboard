
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_id text UNIQUE,
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS profile_photo text,
  ADD COLUMN IF NOT EXISTS nationality text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS current_visa_status text,
  ADD COLUMN IF NOT EXISTS current_visa_expiry_date date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS visa_issued_by text,
  ADD COLUMN IF NOT EXISTS referred_by text,
  ADD COLUMN IF NOT EXISTS employment_type text,
  ADD COLUMN IF NOT EXISTS food_allowance numeric,
  ADD COLUMN IF NOT EXISTS ot_amount numeric,
  ADD COLUMN IF NOT EXISTS accommodation numeric,
  ADD COLUMN IF NOT EXISTS transport numeric,
  ADD COLUMN IF NOT EXISTS commission_rate numeric,
  ADD COLUMN IF NOT EXISTS assigned_branch text,
  ADD COLUMN IF NOT EXISTS passport_number text,
  ADD COLUMN IF NOT EXISTS passport_expiry_date date,
  ADD COLUMN IF NOT EXISTS visa_expiry_date date,
  ADD COLUMN IF NOT EXISTS emirates_id_number text,
  ADD COLUMN IF NOT EXISTS emirates_id_expiry_date date,
  ADD COLUMN IF NOT EXISTS ohc_number text,
  ADD COLUMN IF NOT EXISTS ohc_expiry_date date,
  ADD COLUMN IF NOT EXISTS iloe_insurance_number text,
  ADD COLUMN IF NOT EXISTS iloe_insurance_expiry_date date,
  ADD COLUMN IF NOT EXISTS labor_card_number text,
  ADD COLUMN IF NOT EXISTS labor_card_expiry_date date,
  ADD COLUMN IF NOT EXISTS medical_insurance_number text,
  ADD COLUMN IF NOT EXISTS medical_insurance_expiry_date date,
  ADD COLUMN IF NOT EXISTS part_time_card_number text,
  ADD COLUMN IF NOT EXISTS part_time_card_expiry_date date;

CREATE POLICY "Auth read employee images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'employee-images');
CREATE POLICY "Auth insert employee images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-images');
CREATE POLICY "Auth update employee images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-images');
CREATE POLICY "Auth delete employee images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'employee-images');
