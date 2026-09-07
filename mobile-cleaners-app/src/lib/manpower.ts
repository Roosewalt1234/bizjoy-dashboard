import { supabase } from "./supabase";
import type { ProjectOption, StaffOption } from "@/types/database";

/** All FM projects, for the manager/admin project picker and provisioning. */
export async function fetchProjects(): Promise<ProjectOption[]> {
  const { data, error } = await supabase
    .from("fm_contracts")
    .select("id, title, site_name")
    .order("title", { ascending: true });
  if (error) throw error;
  return (data as ProjectOption[]) ?? [];
}

/**
 * Staff actively assigned to a project, sourced from contract_manpower_assignments.
 * An employee can have more than one assignment row per project (different roles/shifts) -
 * dedupe by employee id since the photo grid only needs one tile per person.
 */
export async function fetchProjectStaff(contractId: string): Promise<StaffOption[]> {
  const { data, error } = await supabase
    .from("contract_manpower_assignments")
    .select("employees:employee_id(id, full_name, first_name, email, profile_photo)")
    .eq("contract_id", contractId)
    .eq("active", true);
  if (error) throw error;

  const rows = (data ?? []) as unknown as { employees: StaffOption | null }[];
  const seen = new Set<string>();
  const staff: StaffOption[] = [];
  for (const row of rows) {
    if (!row.employees || seen.has(row.employees.id)) continue;
    seen.add(row.employees.id);
    staff.push(row.employees);
  }
  return staff;
}
