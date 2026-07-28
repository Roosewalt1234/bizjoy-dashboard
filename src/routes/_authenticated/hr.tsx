import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { EmployeeForm } from "@/components/employee-form";
import { ExportMenu } from "@/components/export-menu";

export const Route = createFileRoute("/_authenticated/hr")({
  component: HRPage,
});

function HRPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [page, setPage] = useState(1);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      const { data, error } = await supabase.from("employees").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(rows as any[], page);


  async function remove(id: string) {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["employees"] });
  }

  function openNew() { setEditing(null); setOpen(true); }
  function openEdit(row: any) { setEditing(row); setOpen(true); }
  function onSaved() { setOpen(false); qc.invalidateQueries({ queryKey: ["employees"] }); }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Human Resources</h1>
          <p className="text-muted-foreground">Manage employees and staff.</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="employees"
            sheetName="Employees"
            rows={rows as any[]}
            columns={[
              { key: "employee_id", label: "Employee ID" },
              { key: "full_name", label: "Full Name", format: (v, r) => v ?? [r.first_name, r.last_name].filter(Boolean).join(" ") },
              { key: "position", label: "Position" },
              { key: "department", label: "Department" },
              { key: "nationality", label: "Nationality" },
              { key: "email", label: "Email" },
              { key: "phone", label: "Phone" },
              { key: "employment_type", label: "Employment Type" },
              { key: "hire_date", label: "Hire Date" },
              { key: "salary", label: "Salary" },
              { key: "status", label: "Status" },
              { key: "passport_number", label: "Passport #" },
              { key: "passport_expiry_date", label: "Passport Expiry" },
              { key: "visa_expiry_date", label: "Visa Expiry" },
              { key: "emirates_id_number", label: "Emirates ID" },
              { key: "emirates_id_expiry_date", label: "Emirates ID Expiry" },
            ]}
          />
          <Button onClick={openNew}><Plus className="h-4 w-4 mr-2" /> Add</Button>
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Employee ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>Nationality</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : rows.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No employees yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell>{r.employee_id ?? "—"}</TableCell>
                <TableCell>{r.full_name ?? ([r.first_name, r.last_name].filter(Boolean).join(" ") || "—")}</TableCell>
                <TableCell>{r.position ?? "—"}</TableCell>
                <TableCell>{r.nationality ?? "—"}</TableCell>
                <TableCell>{r.phone ?? "—"}</TableCell>
                <TableCell>{r.status ?? "—"}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete this employee?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Employee" : "Add New Employee"}</DialogTitle>
          </DialogHeader>
          <EmployeeForm initial={editing} onSaved={onSaved} onCancel={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
