/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ExportMenu } from "@/components/export-menu";
import { PAGE_SIZE, paginate, PaginationBar } from "@/components/pagination-bar";
import { MANPOWER_ROLES, MANPOWER_SHIFTS } from "@/lib/fm-manpower";

export const Route = createFileRoute("/_authenticated/fm-manpower")({
  component: ContractManpowerPage,
});

const fmDb = supabase as any;

const emptyPlan = {
  contract_id: "",
  service_category_id: "none",
  role_name: "FM Supervisor",
  designation: "FM Supervisor",
  shift_name: "Day Shift",
  shift_start: "08:00",
  shift_end: "17:00",
  required_headcount: "1",
  hours_per_day: "8",
  days_per_week: "6",
  remarks: "",
  active: "true",
};

const emptyAssignment = {
  contract_id: "",
  manpower_plan_id: "none",
  employee_id: "",
  employee_name: "",
  role_name: "FM Supervisor",
  designation: "FM Supervisor",
  shift_name: "Day Shift",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: "",
  active: "true",
  remarks: "",
};

const parksideTemplate = [
  ["MEP", "FM Supervisor", 1, "Day Shift", 8, 6],
  ["HVAC", "HVAC Technician", 1, "Day Shift", 12, 6],
  ["Electrical", "Electrician", 1, "Day Shift", 12, 6],
  ["Plumbing", "Plumber", 1, "Day Shift", 12, 6],
  ["MEP", "Multi Technician", 1, "Day Shift", 12, 6],
  ["Cleaning", "Cleaning Team Leader", 1, "Day Shift", 12, 7],
  ["Cleaning", "Male Cleaner", 2, "Day Shift", 12, 7],
  ["Cleaning", "Female Cleaner", 1, "Day Shift", 12, 7],
  ["Cleaning", "Male Cleaner", 1, "Night Shift", 12, 7],
  ["Swimming Pool", "Pool Technician", 1, "Weekly Visit", null, 3],
  ["Lift", "Lift Contractor / OEM", 1, "On Call", null, null],
] as const;

function ContractManpowerPage() {
  const qc = useQueryClient();
  const [contractFilter, setContractFilter] = useState("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [activeFilter, setActiveFilter] = useState("all");
  const [planPage, setPlanPage] = useState(1);
  const [assignmentPage, setAssignmentPage] = useState(1);
  const [planOpen, setPlanOpen] = useState(false);
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any | null>(null);
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);
  const [planForm, setPlanForm] = useState(emptyPlan);
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [saving, setSaving] = useState(false);
  const [addingTemplate, setAddingTemplate] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-manpower"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contracts")
        .select("id, title, contract_no, customer_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["service-categories-lookup-manpower"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("service_categories")
        .select("id, name")
        .eq("active", true)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-lookup-manpower"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, full_name, designation, status")
        .order("first_name", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((employee: any) => ({
        ...employee,
        name:
          employee.full_name ?? [employee.first_name, employee.last_name].filter(Boolean).join(" "),
      }));
    },
  });

  const { data: plans = [], isLoading: plansLoading } = useQuery({
    queryKey: ["contract_manpower_plans"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_manpower_plans")
        .select(
          "*, fm_contracts:contract_id(id, title, contract_no, customer_name), service_categories:service_category_id(id, name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assignments = [], isLoading: assignmentsLoading } = useQuery({
    queryKey: ["contract_manpower_assignments"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("contract_manpower_assignments")
        .select(
          "*, fm_contracts:contract_id(id, title, contract_no, customer_name), employees:employee_id(id, first_name, last_name, full_name), contract_manpower_plans:manpower_plan_id(id, role_name, shift_name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredPlans = useMemo(() => {
    return (plans as any[]).filter((row) => {
      if (contractFilter !== "all" && row.contract_id !== contractFilter) return false;
      if (roleFilter !== "all" && row.role_name !== roleFilter && row.designation !== roleFilter)
        return false;
      if (shiftFilter !== "all" && row.shift_name !== shiftFilter) return false;
      if (categoryFilter !== "all" && row.service_category_id !== categoryFilter) return false;
      return true;
    });
  }, [plans, contractFilter, roleFilter, shiftFilter, categoryFilter]);

  const filteredAssignments = useMemo(() => {
    return (assignments as any[]).filter((row) => {
      if (contractFilter !== "all" && row.contract_id !== contractFilter) return false;
      if (employeeFilter !== "all" && row.employee_id !== employeeFilter) return false;
      if (
        activeFilter !== "all" &&
        String(row.active ?? row.status !== "Inactive") !== activeFilter
      )
        return false;
      return true;
    });
  }, [assignments, contractFilter, employeeFilter, activeFilter]);

  useEffect(() => {
    const maxPlanPage = Math.max(1, Math.ceil(filteredPlans.length / PAGE_SIZE));
    if (planPage > maxPlanPage) setPlanPage(maxPlanPage);
  }, [filteredPlans.length, planPage]);
  useEffect(() => {
    const maxAssignmentPage = Math.max(1, Math.ceil(filteredAssignments.length / PAGE_SIZE));
    if (assignmentPage > maxAssignmentPage) setAssignmentPage(maxAssignmentPage);
  }, [assignmentPage, filteredAssignments.length]);

  function startPlan(row?: any) {
    setEditingPlan(row ?? null);
    setPlanForm(
      row
        ? {
            contract_id: row.contract_id ?? "",
            service_category_id: row.service_category_id ?? "none",
            role_name: row.role_name ?? "FM Supervisor",
            designation: row.designation ?? row.role_name ?? "FM Supervisor",
            shift_name: row.shift_name ?? "Day Shift",
            shift_start: row.shift_start?.slice(0, 5) ?? "",
            shift_end: row.shift_end?.slice(0, 5) ?? "",
            required_headcount: String(row.required_headcount ?? 1),
            hours_per_day: row.hours_per_day == null ? "" : String(row.hours_per_day),
            days_per_week: row.days_per_week == null ? "" : String(row.days_per_week),
            remarks: row.remarks ?? row.notes ?? "",
            active: String(row.active ?? true),
          }
        : { ...emptyPlan, contract_id: contractFilter === "all" ? "" : contractFilter },
    );
    setPlanOpen(true);
  }

  function startAssignment(row?: any) {
    setEditingAssignment(row ?? null);
    setAssignmentForm(
      row
        ? {
            contract_id: row.contract_id ?? "",
            manpower_plan_id: row.manpower_plan_id ?? "none",
            employee_id: row.employee_id ?? "",
            employee_name: row.employee_name ?? row.employees?.full_name ?? "",
            role_name: row.role_name ?? "FM Supervisor",
            designation: row.designation ?? row.role_name ?? "FM Supervisor",
            shift_name: row.shift_name ?? "Day Shift",
            start_date: row.start_date ?? "",
            end_date: row.end_date ?? "",
            active: String(row.active ?? row.status !== "Inactive"),
            remarks: row.remarks ?? row.notes ?? "",
          }
        : { ...emptyAssignment, contract_id: contractFilter === "all" ? "" : contractFilter },
    );
    setAssignmentOpen(true);
  }

  async function savePlan() {
    if (!planForm.contract_id) {
      toast.error("Select a contract");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contract_id: planForm.contract_id,
        service_category_id:
          planForm.service_category_id === "none" ? null : planForm.service_category_id,
        role_name: planForm.role_name,
        designation: planForm.designation || planForm.role_name,
        shift_name: planForm.shift_name,
        shift_start: planForm.shift_start || null,
        shift_end: planForm.shift_end || null,
        required_headcount: Number(planForm.required_headcount) || 1,
        hours_per_day: planForm.hours_per_day === "" ? null : Number(planForm.hours_per_day),
        days_per_week: planForm.days_per_week === "" ? null : Number(planForm.days_per_week),
        notes: planForm.remarks || null,
        remarks: planForm.remarks || null,
        active: planForm.active === "true",
      };
      const query = editingPlan
        ? fmDb.from("contract_manpower_plans").update(payload).eq("id", editingPlan.id)
        : fmDb.from("contract_manpower_plans").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast.success(editingPlan ? "Manpower plan updated" : "Manpower plan added");
      setPlanOpen(false);
      qc.invalidateQueries({ queryKey: ["contract_manpower_plans"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignment() {
    if (!assignmentForm.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!assignmentForm.employee_id && !assignmentForm.employee_name.trim()) {
      toast.error("Select an employee");
      return;
    }
    setSaving(true);
    try {
      const employee = employees.find((item: any) => item.id === assignmentForm.employee_id);
      const payload = {
        contract_id: assignmentForm.contract_id,
        manpower_plan_id:
          assignmentForm.manpower_plan_id === "none" ? null : assignmentForm.manpower_plan_id,
        employee_id: assignmentForm.employee_id || null,
        employee_name: (employee?.name ?? assignmentForm.employee_name) || null,
        role_name: assignmentForm.role_name,
        designation: assignmentForm.designation || assignmentForm.role_name,
        shift_name: assignmentForm.shift_name,
        start_date: assignmentForm.start_date || null,
        end_date: assignmentForm.end_date || null,
        status: assignmentForm.active === "true" ? "Active" : "Inactive",
        active: assignmentForm.active === "true",
        notes: assignmentForm.remarks || null,
        remarks: assignmentForm.remarks || null,
      };
      const query = editingAssignment
        ? fmDb.from("contract_manpower_assignments").update(payload).eq("id", editingAssignment.id)
        : fmDb.from("contract_manpower_assignments").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast.success(editingAssignment ? "Assignment updated" : "Employee assigned");
      setAssignmentOpen(false);
      qc.invalidateQueries({ queryKey: ["contract_manpower_assignments"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(table: string, id: string, key: string) {
    const { error } = await fmDb.from(table).delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: [key] });
  }

  async function addTemplate() {
    if (contractFilter === "all") {
      toast.error("Select a contract first");
      return;
    }
    setAddingTemplate(true);
    try {
      const existing = new Set(
        (plans as any[])
          .filter((plan) => plan.contract_id === contractFilter)
          .map((plan) => `${plan.role_name}|${plan.shift_name}`),
      );
      const byCategory = new Map(
        categories.map((category: any) => [category.name.toLowerCase(), category.id]),
      );
      const rows = parksideTemplate
        .filter(([, role, , shift]) => !existing.has(`${role}|${shift}`))
        .map(([category, role, headcount, shift, hours, days]) => ({
          contract_id: contractFilter,
          service_category_id: byCategory.get(category.toLowerCase()) ?? null,
          role_name: role,
          designation: role,
          shift_name: shift,
          required_headcount: headcount,
          hours_per_day: hours,
          days_per_week: days,
          remarks: category,
          notes: category,
          active: true,
        }));
      if (!rows.length) {
        toast.info("Template rows already exist for this contract");
        return;
      }
      const { error } = await fmDb.from("contract_manpower_plans").insert(rows);
      if (error) throw error;
      toast.success(`Added ${rows.length} manpower template rows`);
      qc.invalidateQueries({ queryKey: ["contract_manpower_plans"] });
    } catch (error: any) {
      toast.error(error.message ?? "Template insert failed");
    } finally {
      setAddingTemplate(false);
    }
  }

  const contractSelect = (
    <>
      <SelectItem value="all">All Contracts</SelectItem>
      {contracts.map((contract: any) => (
        <SelectItem key={contract.id} value={contract.id}>
          {(contract.contract_no ? `${contract.contract_no} - ` : "") +
            (contract.customer_name ?? contract.title ?? "Untitled")}
        </SelectItem>
      ))}
    </>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM Manpower Planning</h1>
          <p className="text-muted-foreground">
            Plan required headcount and assign employees to FM contracts.
          </p>
        </div>
      </div>

      <Tabs defaultValue="plans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="plans">Manpower Plans</TabsTrigger>
          <TabsTrigger value="assignments">Employee Assignments</TabsTrigger>
        </TabsList>
        <Card className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <Filter
              label="Contract"
              value={contractFilter}
              onValueChange={(value) => {
                setContractFilter(value);
                setPlanPage(1);
                setAssignmentPage(1);
              }}
            >
              {contractSelect}
            </Filter>
            <Filter
              label="Role"
              value={roleFilter}
              onValueChange={(value) => {
                setRoleFilter(value);
                setPlanPage(1);
              }}
            >
              <SelectItem value="all">All Roles</SelectItem>
              {MANPOWER_ROLES.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </Filter>
            <Filter
              label="Shift"
              value={shiftFilter}
              onValueChange={(value) => {
                setShiftFilter(value);
                setPlanPage(1);
              }}
            >
              <SelectItem value="all">All Shifts</SelectItem>
              {MANPOWER_SHIFTS.map((shift) => (
                <SelectItem key={shift} value={shift}>
                  {shift}
                </SelectItem>
              ))}
            </Filter>
            <Filter
              label="Category"
              value={categoryFilter}
              onValueChange={(value) => {
                setCategoryFilter(value);
                setPlanPage(1);
              }}
            >
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category: any) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </Filter>
            <div className="flex items-end">
              {contractFilter !== "all" && (
                <Button
                  className="w-full"
                  variant="outline"
                  onClick={addTemplate}
                  disabled={addingTemplate}
                >
                  Add 48 Parkside Manpower Template
                </Button>
              )}
            </div>
          </div>
        </Card>

        <TabsContent value="plans" className="space-y-4">
          <div className="flex justify-end gap-2">
            <ExportMenu
              filename="manpower-plans"
              sheetName="Manpower Plans"
              rows={filteredPlans}
              columns={[
                { key: "role_name", label: "Role" },
                { key: "designation", label: "Designation" },
                { key: "shift_name", label: "Shift" },
                { key: "required_headcount", label: "Required Headcount" },
                { key: "hours_per_day", label: "Hours / Day" },
                { key: "days_per_week", label: "Days / Week" },
                { key: "active", label: "Active" },
              ]}
            />
            <Button onClick={() => startPlan()}>
              <Plus className="h-4 w-4 mr-2" /> Add Plan
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Role / Designation</TableHead>
                  <TableHead>Shift</TableHead>
                  <TableHead>Required</TableHead>
                  <TableHead>Hours / Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {plansLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : paginate(filteredPlans, planPage).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No manpower plans found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginate(filteredPlans, planPage).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.fm_contracts?.contract_no ?? row.fm_contracts?.customer_name ?? "-"}
                      </TableCell>
                      <TableCell>{row.service_categories?.name ?? "-"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.role_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.designation ?? "-"}
                        </div>
                      </TableCell>
                      <TableCell>{row.shift_name ?? "-"}</TableCell>
                      <TableCell>{row.required_headcount ?? 0}</TableCell>
                      <TableCell>
                        {row.hours_per_day ?? "-"} h / {row.days_per_week ?? "-"} d
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.active === false ? "Inactive" : "Active"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          onEdit={() => startPlan(row)}
                          onDelete={() =>
                            remove("contract_manpower_plans", row.id, "contract_manpower_plans")
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationBar
              page={planPage}
              total={filteredPlans.length}
              onPageChange={setPlanPage}
            />
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Filter
                label="Employee"
                value={employeeFilter}
                onValueChange={(value) => {
                  setEmployeeFilter(value);
                  setAssignmentPage(1);
                }}
              >
                <SelectItem value="all">All Employees</SelectItem>
                {employees.map((employee: any) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    {employee.name}
                  </SelectItem>
                ))}
              </Filter>
              <Filter
                label="Active"
                value={activeFilter}
                onValueChange={(value) => {
                  setActiveFilter(value);
                  setAssignmentPage(1);
                }}
              >
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Active</SelectItem>
                <SelectItem value="false">Inactive</SelectItem>
              </Filter>
            </div>
          </Card>
          <div className="flex justify-end gap-2">
            <ExportMenu
              filename="manpower-assignments"
              sheetName="Manpower Assignments"
              rows={filteredAssignments}
              columns={[
                { key: "employee_name", label: "Employee" },
                { key: "role_name", label: "Role" },
                { key: "designation", label: "Designation" },
                { key: "shift_name", label: "Shift" },
                { key: "start_date", label: "Start Date" },
                { key: "end_date", label: "End Date" },
                { key: "status", label: "Status" },
              ]}
            />
            <Button onClick={() => startAssignment()}>
              <Plus className="h-4 w-4 mr-2" /> Assign Employee
            </Button>
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Role / Designation</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignmentsLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : paginate(filteredAssignments, assignmentPage).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No assignments found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginate(filteredAssignments, assignmentPage).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        {row.fm_contracts?.contract_no ?? row.fm_contracts?.customer_name ?? "-"}
                      </TableCell>
                      <TableCell>{row.employee_name ?? row.employees?.full_name ?? "-"}</TableCell>
                      <TableCell>{row.contract_manpower_plans?.role_name ?? "-"}</TableCell>
                      <TableCell>
                        <div className="font-medium">{row.role_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {row.designation ?? row.shift_name ?? "-"}
                        </div>
                      </TableCell>
                      <TableCell>
                        {row.start_date ?? "-"} to {row.end_date ?? "open"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {row.active === false ? "Inactive" : (row.status ?? "Active")}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <RowActions
                          onEdit={() => startAssignment(row)}
                          onDelete={() =>
                            remove(
                              "contract_manpower_assignments",
                              row.id,
                              "contract_manpower_assignments",
                            )
                          }
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationBar
              page={assignmentPage}
              total={filteredAssignments.length}
              onPageChange={setAssignmentPage}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <PlanDialog
        open={planOpen}
        setOpen={setPlanOpen}
        form={planForm}
        setForm={setPlanForm}
        contracts={contracts}
        categories={categories}
        save={savePlan}
        saving={saving}
        editing={Boolean(editingPlan)}
      />
      <AssignmentDialog
        open={assignmentOpen}
        setOpen={setAssignmentOpen}
        form={assignmentForm}
        setForm={setAssignmentForm}
        contracts={contracts}
        plans={plans}
        employees={employees}
        save={saveAssignment}
        saving={saving}
        editing={Boolean(editingAssignment)}
      />
    </div>
  );
}

function Filter({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>{children}</SelectContent>
      </Select>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex justify-end gap-1">
      <Button size="icon" variant="ghost" onClick={onEdit}>
        <Pencil className="h-4 w-4" />
      </Button>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button size="icon" variant="ghost">
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this row?</AlertDialogTitle>
            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PlanDialog({
  open,
  setOpen,
  form,
  setForm,
  contracts,
  categories,
  save,
  saving,
  editing,
}: any) {
  const update = (patch: Record<string, string>) => setForm((prev: any) => ({ ...prev, ...patch }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Manpower Plan" : "Add Manpower Plan"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SelectField
            label="Contract"
            value={form.contract_id}
            onValueChange={(value) => update({ contract_id: value })}
          >
            {contracts.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {(c.contract_no ? `${c.contract_no} - ` : "") +
                  (c.customer_name ?? c.title ?? "Untitled")}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField
            label="Service Category"
            value={form.service_category_id}
            onValueChange={(value) => update({ service_category_id: value })}
          >
            <SelectItem value="none">None</SelectItem>
            {categories.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField
            label="Role"
            value={form.role_name}
            onValueChange={(value) => update({ role_name: value, designation: value })}
          >
            {MANPOWER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectField>
          <Field label="Designation">
            <Input
              value={form.designation}
              onChange={(event) => update({ designation: event.target.value })}
            />
          </Field>
          <SelectField
            label="Shift"
            value={form.shift_name}
            onValueChange={(value) => update({ shift_name: value })}
          >
            {MANPOWER_SHIFTS.map((shift) => (
              <SelectItem key={shift} value={shift}>
                {shift}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField
            label="Active"
            value={form.active}
            onValueChange={(value) => update({ active: value })}
          >
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectField>
          <Field label="Shift Start">
            <Input
              type="time"
              value={form.shift_start}
              onChange={(event) => update({ shift_start: event.target.value })}
            />
          </Field>
          <Field label="Shift End">
            <Input
              type="time"
              value={form.shift_end}
              onChange={(event) => update({ shift_end: event.target.value })}
            />
          </Field>
          <Field label="Required Headcount">
            <Input
              type="number"
              min="1"
              value={form.required_headcount}
              onChange={(event) => update({ required_headcount: event.target.value })}
            />
          </Field>
          <Field label="Hours / Day">
            <Input
              type="number"
              step="0.25"
              value={form.hours_per_day}
              onChange={(event) => update({ hours_per_day: event.target.value })}
            />
          </Field>
          <Field label="Days / Week">
            <Input
              type="number"
              step="0.5"
              value={form.days_per_week}
              onChange={(event) => update({ days_per_week: event.target.value })}
            />
          </Field>
          <Field label="Remarks">
            <Input
              value={form.remarks}
              onChange={(event) => update({ remarks: event.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Plan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignmentDialog({
  open,
  setOpen,
  form,
  setForm,
  contracts,
  plans,
  employees,
  save,
  saving,
  editing,
}: any) {
  const update = (patch: Record<string, string>) => setForm((prev: any) => ({ ...prev, ...patch }));
  function pickEmployee(id: string) {
    const employee = employees.find((item: any) => item.id === id);
    update({ employee_id: id, employee_name: employee?.name ?? "" });
  }
  function pickPlan(id: string) {
    const plan = plans.find((item: any) => item.id === id);
    update({
      manpower_plan_id: id,
      contract_id: plan?.contract_id ?? form.contract_id,
      role_name: plan?.role_name ?? form.role_name,
      designation: plan?.designation ?? plan?.role_name ?? form.designation,
      shift_name: plan?.shift_name ?? form.shift_name,
    });
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Assignment" : "Assign Employee"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <SelectField
            label="Contract"
            value={form.contract_id}
            onValueChange={(value) => update({ contract_id: value })}
          >
            {contracts.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                {(c.contract_no ? `${c.contract_no} - ` : "") +
                  (c.customer_name ?? c.title ?? "Untitled")}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField label="Manpower Plan" value={form.manpower_plan_id} onValueChange={pickPlan}>
            <SelectItem value="none">None</SelectItem>
            {plans
              .filter((p: any) => !form.contract_id || p.contract_id === form.contract_id)
              .map((p: any) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.role_name} - {p.shift_name}
                </SelectItem>
              ))}
          </SelectField>
          <SelectField label="Employee" value={form.employee_id} onValueChange={pickEmployee}>
            {employees.map((e: any) => (
              <SelectItem key={e.id} value={e.id}>
                {e.name}
              </SelectItem>
            ))}
          </SelectField>
          <SelectField
            label="Role"
            value={form.role_name}
            onValueChange={(value) => update({ role_name: value, designation: value })}
          >
            {MANPOWER_ROLES.map((role) => (
              <SelectItem key={role} value={role}>
                {role}
              </SelectItem>
            ))}
          </SelectField>
          <Field label="Designation">
            <Input
              value={form.designation}
              onChange={(event) => update({ designation: event.target.value })}
            />
          </Field>
          <SelectField
            label="Shift"
            value={form.shift_name}
            onValueChange={(value) => update({ shift_name: value })}
          >
            {MANPOWER_SHIFTS.map((shift) => (
              <SelectItem key={shift} value={shift}>
                {shift}
              </SelectItem>
            ))}
          </SelectField>
          <Field label="Start Date">
            <Input
              type="date"
              value={form.start_date}
              onChange={(event) => update({ start_date: event.target.value })}
            />
          </Field>
          <Field label="End Date">
            <Input
              type="date"
              value={form.end_date}
              onChange={(event) => update({ end_date: event.target.value })}
            />
          </Field>
          <SelectField
            label="Active"
            value={form.active}
            onValueChange={(value) => update({ active: value })}
          >
            <SelectItem value="true">Active</SelectItem>
            <SelectItem value="false">Inactive</SelectItem>
          </SelectField>
          <Field label="Remarks">
            <Input
              value={form.remarks}
              onChange={(event) => update({ remarks: event.target.value })}
            />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Assignment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  children,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <Field label={label}>
      <Select value={value || undefined} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={`Select ${label.toLowerCase()}...`} />
        </SelectTrigger>
        <SelectContent className="max-h-72">{children}</SelectContent>
      </Select>
    </Field>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
