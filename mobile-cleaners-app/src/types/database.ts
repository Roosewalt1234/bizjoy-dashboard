// Hand-picked subset of the shared Supabase schema - only the tables this app touches.
// Source of truth is the web dashboard's migrations (../../supabase/migrations).

export type AreaType = "section" | "utility_room";
export type FrequencyType = "daily" | "weekly" | "custom_days";
export type VisitItemStatus = "done" | "skipped" | "issue";
export type AttendanceStatus = "Present" | "Absent" | "Late" | "Half Day" | "Leave";

export interface EmployeeRow {
  id: string;
  auth_user_id: string | null;
  first_name: string;
  last_name: string | null;
  full_name: string | null;
  status: string | null;
}

export interface CleaningAreaRow {
  id: string;
  tower_id: string;
  floor_id: string | null;
  section_id: string | null;
  catalog_id: string | null;
  area_type: AreaType;
  name: string;
  quantity: number;
  notes: string | null;
  sort_order: number;
  nfc_token: string;
}

export interface CleaningFloorRow {
  id: string;
  tower_id: string;
  label: string;
  floor_number: number | null;
  sort_order: number;
}

export interface CleaningTowerRow {
  id: string;
  contract_id: string;
  name: string;
  floor_count: number;
  sort_order: number;
}

export interface CleaningScheduleRow {
  id: string;
  floor_id: string;
  area_id: string;
  frequency_type: FrequencyType;
  days_of_week: number[] | null;
  time_window_start: string | null;
  time_window_end: string | null;
  assigned_employee_id: string | null;
  active: boolean;
}

export interface CleaningVisitRow {
  id: string;
  floor_id: string;
  tower_id: string;
  section_id: string | null;
  performed_by_employee_id: string | null;
  scanned_at: string;
  notes: string | null;
}

export interface CleaningVisitItemRow {
  id: string;
  visit_id: string;
  area_id: string | null;
  status: VisitItemStatus;
  note: string | null;
  before_photo_path: string | null;
  after_photo_path: string | null;
  sort_order: number;
}

export type PpmVisitStatus = "Planned" | "Converted" | "Completed";

export interface ContractAssetRow {
  id: string;
  contract_id: string;
  asset_tag: string | null;
  asset_type: string | null;
  description: string | null;
  location: string | null;
  floor: string | null;
  zone: string | null;
  nfc_token: string;
}

export interface PpmScheduleRow {
  id: string;
  contract_id: string;
  asset_id: string;
  schedule_name: string;
  frequency: string | null;
  interval_months: number | null;
  start_date: string | null;
  end_date: string | null;
  instructions: string | null;
  assigned_employee_id: string | null;
  active: boolean;
}

export interface PpmVisitRow {
  id: string;
  ppm_schedule_id: string | null;
  contract_id: string;
  asset_id: string | null;
  planned_date: string;
  due_date: string | null;
  status: PpmVisitStatus;
  notes: string | null;
  completed_at: string | null;
  completed_by_employee_id: string | null;
  before_photo_path: string | null;
  after_photo_path: string | null;
}

export interface FmWorkOrderRow {
  id: string;
  wo_no: string | null;
  contract_id: string | null;
  asset_id: string | null;
  technician_id: string | null;
  technician_name: string | null;
  request_type: string | null;
  service_type: string | null;
  location: string | null;
  priority: string;
  problem_reported: string | null;
  work_requested: string | null;
  notes: string | null;
  status: string;
  scheduled_date: string | null;
  requested_date: string | null;
  completed_at: string | null;
  before_photo_path: string | null;
  after_photo_path: string | null;
  created_at: string;
}

export interface AttendanceLogRow {
  id: string;
  contract_id: string | null;
  employee_id: string | null;
  employee_name: string | null;
  attendance_date: string;
  shift_name: string | null;
  check_in: string | null;
  check_out: string | null;
  status: AttendanceStatus;
  source: string | null;
  remarks: string | null;
}

