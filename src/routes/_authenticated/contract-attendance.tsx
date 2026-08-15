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
import { ExportMenu } from "@/components/export-menu";
import { PAGE_SIZE, paginate, PaginationBar } from "@/components/pagination-bar";
import {
  ATTENDANCE_SOURCES,
  ATTENDANCE_STATUSES,
  MANPOWER_SHIFTS,
  summarizeAttendance,
  todayIso,
} from "@/lib/fm-manpower";

export const Route = createFileRoute("/_authenticated/contract-attendance")({
  component: ContractAttendancePage,
});

const fmDb = supabase as any;

const emptyForm = {
  contract_id: "",
  employee_id: "",
  employee_name: "",
  attendance_date: todayIso(),
  shift: "Day Shift",
  check_in: "",
  check_out: "",
  status: "Present",
  source: "Manual",
  remarks: "",
};

function ContractAttendancePage() {
  const qc = useQueryClient();
  const [contractFilter, setContractFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState(todayIso());
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [shiftFilter, setShiftFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, contract_no, customer_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-lookup-attendance"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, full_name")
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

  const { data: plans = [] } = useQuery({
    queryKey: ["attendance-manpower-plans", contractFilter],
    queryFn: async () => {
      let query = fmDb.from("contract_manpower_plans").select("*");
      if (contractFilter !== "all") query = query.eq("contract_id", contractFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["attendance-manpower-assignments", contractFilter],
    queryFn: async () => {
      let query = fmDb.from("contract_manpower_assignments").select("*");
      if (contractFilter !== "all") query = query.eq("contract_id", contractFilter);
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["attendance_logs"],
    queryFn: async () => {
      const { data, error } = await fmDb
        .from("attendance_logs")
        .select(
          "*, contracts:contract_id(id, title, contract_no, customer_name), employees:employee_id(id, first_name, last_name, full_name)",
        )
        .order("attendance_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredRows = useMemo(() => {
    return (rows as any[]).filter((row) => {
      if (contractFilter !== "all" && row.contract_id !== contractFilter) return false;
      if (dateFilter && row.attendance_date !== dateFilter) return false;
      if (employeeFilter !== "all" && row.employee_id !== employeeFilter) return false;
      if (shiftFilter !== "all" && (row.shift ?? row.shift_name) !== shiftFilter) return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [rows, contractFilter, dateFilter, employeeFilter, shiftFilter, statusFilter]);

  const summary = useMemo(
    () => summarizeAttendance(plans as any[], assignments as any[], filteredRows),
    [assignments, filteredRows, plans],
  );

  useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
    if (page > totalPages) setPage(totalPages);
  }, [filteredRows.length, page]);

  function start(row?: any) {
    setEditing(row ?? null);
    setForm(
      row
        ? {
            contract_id: row.contract_id ?? "",
            employee_id: row.employee_id ?? "",
            employee_name: row.employee_name ?? row.employees?.full_name ?? "",
            attendance_date: row.attendance_date ?? todayIso(),
            shift: row.shift ?? row.shift_name ?? "Day Shift",
            check_in: row.check_in ? new Date(row.check_in).toISOString().slice(11, 16) : "",
            check_out: row.check_out ? new Date(row.check_out).toISOString().slice(11, 16) : "",
            status: row.status ?? "Present",
            source: row.source ?? "Manual",
            remarks: row.remarks ?? "",
          }
        : {
            ...emptyForm,
            contract_id: contractFilter === "all" ? "" : contractFilter,
            attendance_date: dateFilter || todayIso(),
          },
    );
    setOpen(true);
  }

  async function save() {
    if (!form.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!form.employee_id && !form.employee_name.trim()) {
      toast.error("Select an employee");
      return;
    }
    setSaving(true);
    try {
      const employee = employees.find((item: any) => item.id === form.employee_id);
      const checkIn = form.check_in
        ? new Date(`${form.attendance_date}T${form.check_in}:00`).toISOString()
        : null;
      const checkOut = form.check_out
        ? new Date(`${form.attendance_date}T${form.check_out}:00`).toISOString()
        : null;
      const payload = {
        contract_id: form.contract_id,
        employee_id: form.employee_id || null,
        employee_name: (employee?.name ?? form.employee_name) || null,
        attendance_date: form.attendance_date,
        shift: form.shift,
        shift_name: form.shift,
        check_in: checkIn,
        check_out: checkOut,
        status: form.status,
        source: form.source,
        remarks: form.remarks || null,
      };
      const query = editing
        ? fmDb.from("attendance_logs").update(payload).eq("id", editing.id)
        : fmDb.from("attendance_logs").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast.success(editing ? "Attendance updated" : "Attendance added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["attendance_logs"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function remove(row: any) {
    const { error } = await fmDb.from("attendance_logs").delete().eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Attendance deleted");
    qc.invalidateQueries({ queryKey: ["attendance_logs"] });
  }

  async function generateTodaySheet() {
    if (contractFilter === "all") {
      toast.error("Select a contract first");
      return;
    }
    setGenerating(true);
    try {
      const today = todayIso();
      const active = (assignments as any[]).filter(
        (assignment) => assignment.active !== false && assignment.status !== "Inactive",
      );
      const existing = new Set(
        (rows as any[])
          .filter((row) => row.contract_id === contractFilter && row.attendance_date === today)
          .map((row) => `${row.employee_id}|${row.shift ?? row.shift_name}`),
      );
      const toInsert = active
        .filter((assignment) => !existing.has(`${assignment.employee_id}|${assignment.shift_name}`))
        .map((assignment) => ({
          contract_id: contractFilter,
          employee_id: assignment.employee_id ?? null,
          employee_name: assignment.employee_name ?? null,
          attendance_date: today,
          shift: assignment.shift_name ?? "Day Shift",
          shift_name: assignment.shift_name ?? "Day Shift",
          status: assignment.employee_id ? "Present" : "Not Assigned",
          source: "System",
          remarks: assignment.role_name ?? null,
        }));
      if (toInsert.length) {
        const { error } = await fmDb.from("attendance_logs").insert(toInsert);
        if (error) throw error;
      }
      toast.success(`Created ${toInsert.length}; skipped ${active.length - toInsert.length}`);
      qc.invalidateQueries({ queryKey: ["attendance_logs"] });
    } catch (error: any) {
      toast.error(error.message ?? "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">FM Attendance</h1>
          <p className="text-muted-foreground">
            Record daily FM attendance and compare planned headcount against actual presence.
          </p>
        </div>
        <div className="flex gap-2">
          {contractFilter !== "all" && (
            <Button variant="outline" onClick={generateTodaySheet} disabled={generating}>
              Generate Today's Attendance Sheet
            </Button>
          )}
          <Button onClick={() => start()}>
            <Plus className="h-4 w-4 mr-2" /> Add Attendance
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <Metric label="Required Today" value={summary.required} />
        <Metric label="Assigned" value={summary.assigned} />
        <Metric label="Present" value={summary.present} tone="success" />
        <Metric label="Absent" value={summary.absent} tone="danger" />
        <Metric label="Late" value={summary.late} tone="warning" />
        <Metric
          label="Shortage"
          value={summary.shortage}
          tone={summary.shortage ? "danger" : "success"}
        />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <Filter
            label="Contract"
            value={contractFilter}
            onValueChange={(value) => {
              setContractFilter(value);
              setPage(1);
            }}
          >
            <SelectItem value="all">All Contracts</SelectItem>
            {contracts.map((contract: any) => (
              <SelectItem key={contract.id} value={contract.id}>
                {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                  (contract.customer_name ?? contract.title ?? "Untitled")}
              </SelectItem>
            ))}
          </Filter>
          <div>
            <Label className="text-xs">Date</Label>
            <Input
              type="date"
              value={dateFilter}
              onChange={(event) => {
                setDateFilter(event.target.value);
                setPage(1);
              }}
            />
          </div>
          <Filter
            label="Employee"
            value={employeeFilter}
            onValueChange={(value) => {
              setEmployeeFilter(value);
              setPage(1);
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
            label="Shift"
            value={shiftFilter}
            onValueChange={(value) => {
              setShiftFilter(value);
              setPage(1);
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
            label="Status"
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          >
            <SelectItem value="all">All Statuses</SelectItem>
            {ATTENDANCE_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </Filter>
        </div>
      </Card>

      <div className="flex justify-end">
        <ExportMenu
          filename="attendance-logs"
          sheetName="Attendance"
          rows={filteredRows}
          columns={[
            { key: "attendance_date", label: "Date" },
            { key: "employee_name", label: "Employee" },
            { key: "shift", label: "Shift" },
            { key: "status", label: "Status" },
            { key: "source", label: "Source" },
            { key: "remarks", label: "Remarks" },
          ]}
        />
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Contract</TableHead>
              <TableHead>Employee</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Check In</TableHead>
              <TableHead>Check Out</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : paginate(filteredRows, page).length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                  No attendance rows found.
                </TableCell>
              </TableRow>
            ) : (
              paginate(filteredRows, page).map((row: any) => (
                <TableRow key={row.id}>
                  <TableCell>{row.attendance_date}</TableCell>
                  <TableCell>
                    {row.contracts?.contract_no ?? row.contracts?.customer_name ?? "-"}
                  </TableCell>
                  <TableCell>{row.employee_name ?? row.employees?.full_name ?? "-"}</TableCell>
                  <TableCell>{row.shift ?? row.shift_name ?? "-"}</TableCell>
                  <TableCell>
                    {row.check_in ? new Date(row.check_in).toLocaleTimeString() : "-"}
                  </TableCell>
                  <TableCell>
                    {row.check_out ? new Date(row.check_out).toLocaleTimeString() : "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.status}</Badge>
                  </TableCell>
                  <TableCell>{row.source ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <RowActions onEdit={() => start(row)} onDelete={() => remove(row)} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={filteredRows.length} onPageChange={setPage} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Attendance" : "Add Attendance"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SelectField
              label="Contract"
              value={form.contract_id}
              onValueChange={(value) => setForm((prev) => ({ ...prev, contract_id: value }))}
            >
              {contracts.map((contract: any) => (
                <SelectItem key={contract.id} value={contract.id}>
                  {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                    (contract.customer_name ?? contract.title ?? "Untitled")}
                </SelectItem>
              ))}
            </SelectField>
            <SelectField
              label="Employee"
              value={form.employee_id}
              onValueChange={(value) => {
                const employee = employees.find((item: any) => item.id === value);
                setForm((prev) => ({
                  ...prev,
                  employee_id: value,
                  employee_name: employee?.name ?? "",
                }));
              }}
            >
              {employees.map((employee: any) => (
                <SelectItem key={employee.id} value={employee.id}>
                  {employee.name}
                </SelectItem>
              ))}
            </SelectField>
            <Field label="Attendance Date">
              <Input
                type="date"
                value={form.attendance_date}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, attendance_date: event.target.value }))
                }
              />
            </Field>
            <SelectField
              label="Shift"
              value={form.shift}
              onValueChange={(value) => setForm((prev) => ({ ...prev, shift: value }))}
            >
              {MANPOWER_SHIFTS.map((shift) => (
                <SelectItem key={shift} value={shift}>
                  {shift}
                </SelectItem>
              ))}
            </SelectField>
            <Field label="Check In">
              <Input
                type="time"
                value={form.check_in}
                onChange={(event) => setForm((prev) => ({ ...prev, check_in: event.target.value }))}
              />
            </Field>
            <Field label="Check Out">
              <Input
                type="time"
                value={form.check_out}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, check_out: event.target.value }))
                }
              />
            </Field>
            <SelectField
              label="Status"
              value={form.status}
              onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
            >
              {ATTENDANCE_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {status}
                </SelectItem>
              ))}
            </SelectField>
            <SelectField
              label="Source"
              value={form.source}
              onValueChange={(value) => setForm((prev) => ({ ...prev, source: value }))}
            >
              {ATTENDANCE_SOURCES.map((source) => (
                <SelectItem key={source} value={source}>
                  {source}
                </SelectItem>
              ))}
            </SelectField>
            <Field label="Remarks">
              <Input
                value={form.remarks}
                onChange={(event) => setForm((prev) => ({ ...prev, remarks: event.target.value }))}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              {saving ? "Saving..." : "Save Attendance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "danger" | "warning" | "success";
}) {
  const className =
    tone === "danger"
      ? "text-red-600"
      : tone === "warning"
        ? "text-amber-600"
        : tone === "success"
          ? "text-emerald-600"
          : "";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold ${className}`}>{value}</div>
    </Card>
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
            <AlertDialogTitle>Delete this attendance row?</AlertDialogTitle>
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
