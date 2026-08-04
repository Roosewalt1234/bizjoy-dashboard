import { useEffect, useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Eye, Wrench, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { WorkOrderDialog } from "@/components/work-order-dialog";
import { SERVICE_TYPES } from "@/lib/service-reports";
import { WO_STATUS, woStatusClasses, woPriorityClasses, splitItems } from "@/lib/work-orders";
import { usePermissions } from "@/hooks/use-permissions";

export const Route = createFileRoute("/_authenticated/work-orders")({
  component: WorkOrdersPage,
});

function WorkOrdersPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewing, setViewing] = useState<any | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["work_orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (orders as any[]).filter((r) => {
      if (typeFilter !== "all" && r.service_type !== typeFilter) return false;
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return [r.wo_no, r.customer_name, r.technician_name, r.location]
        .some((v) => (v ?? "").toString().toLowerCase().includes(q));
    });
  }, [orders, search, typeFilter, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageRows = paginate(filtered, page);

  const openCount = (orders as any[]).filter((r) => r.status === "Open" || r.status === "Scheduled").length;
  const inProgress = (orders as any[]).filter((r) => r.status === "In Progress").length;
  const completed = (orders as any[]).filter((r) => r.status === "Completed").length;

  async function remove(id: string) {
    const { error } = await supabase.from("work_orders").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Work order deleted");
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work Orders</h1>
          <p className="text-muted-foreground">Raise jobs for technicians before the site visit</p>
        </div>
        <div className="flex items-center gap-2">
          <ExportMenu
            filename="work-orders"
            rows={filtered}
            sheetName="Work Orders"
            columns={[
              { key: "wo_no", label: "WO No" },
              { key: "requested_date", label: "Requested" },
              { key: "scheduled_date", label: "Scheduled" },
              { key: "customer_name", label: "Customer" },
              { key: "service_type", label: "Service Type" },
              { key: "technician_name", label: "Technician" },
              { key: "location", label: "Location" },
              { key: "priority", label: "Priority" },
              { key: "status", label: "Status" },
            ]}
          />
          {can("service", "add") && (
            <Button onClick={() => { setEditing(null); setOpen(true); }}>
              <Plus className="h-4 w-4 mr-2" /> New Work Order
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Total Work Orders</div>
          <div className="text-2xl font-bold">{orders.length}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Open / Scheduled</div>
          <div className="text-2xl font-bold text-amber-600">{openCount}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">In Progress</div>
          <div className="text-2xl font-bold text-blue-600">{inProgress}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Completed</div>
          <div className="text-2xl font-bold text-emerald-600">{completed}</div>
        </Card>
      </div>

      <Card className="p-3 flex flex-col md:flex-row gap-2">
        <Input
          placeholder="Search WO no, customer, technician, location..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="md:max-w-sm"
        />
        <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-56"><SelectValue placeholder="Service type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service types</SelectItem>
            {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
          <SelectTrigger className="md:w-44"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </Card>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>WO No</TableHead>
              <TableHead>Requested</TableHead>
              <TableHead>Scheduled</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Service Type</TableHead>
              <TableHead>Technician</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-40 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No work orders yet.</TableCell></TableRow>
            ) : pageRows.map((r: any) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">{r.wo_no ?? "—"}</TableCell>
                <TableCell>{r.requested_date ?? "—"}</TableCell>
                <TableCell>{r.scheduled_date ?? "—"}</TableCell>
                <TableCell>{r.customer_name ?? "—"}</TableCell>
                <TableCell>
                  {r.service_type ? <Badge variant="secondary" className="gap-1"><Wrench className="h-3 w-3" />{r.service_type}</Badge> : "—"}
                </TableCell>
                <TableCell>{r.technician_name ?? "—"}</TableCell>
                <TableCell><Badge variant="outline" className={woPriorityClasses(r.priority)}>{r.priority}</Badge></TableCell>
                <TableCell><Badge variant="outline" className={woStatusClasses(r.status)}>{r.status}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button size="icon" variant="ghost" title="View" onClick={() => setViewing(r)}><Eye className="h-4 w-4" /></Button>
                    {can("service", "add") && (
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Create work completion report"
                        onClick={() => navigate({ to: "/service", search: { wo: r.id } as any })}
                      >
                        <ClipboardCheck className="h-4 w-4" />
                      </Button>
                    )}
                    {can("service", "edit") && (
                      <Button size="icon" variant="ghost" title="Edit" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    )}
                    {can("service", "delete") && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button size="icon" variant="ghost" title="Delete"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete work order?</AlertDialogTitle>
                            <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => remove(r.id)}>Delete</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>

      <WorkOrderDialog open={open} onOpenChange={setOpen} editing={editing} />
      <WorkOrderView order={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function WorkOrderView({ order, onClose }: { order: any | null; onClose: () => void }) {
  if (!order) return null;
  const Field = ({ label, value }: { label: string; value: any }) => (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm whitespace-pre-wrap">{value || "—"}</div>
    </div>
  );
  const p = splitItems(order.problem_reported);
  const w = splitItems(order.work_requested);
  const n = Math.max(p.length, w.length, 1);

  return (
    <Dialog open={Boolean(order)} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Work Order {order.wo_no ? `#${order.wo_no}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Requested" value={order.requested_date} />
            <Field label="Scheduled" value={order.scheduled_date} />
            <Field label="Customer" value={order.customer_name} />
            <Field label="Technician" value={order.technician_name} />
            <Field label="Service Type" value={order.service_type} />
            <Field label="Location / Unit" value={order.location} />
            <Field label="Priority" value={order.priority} />
            <Field label="Status" value={order.status} />
          </div>
          {Array.from({ length: n }).map((_, i) => (
            <Card key={i} className="p-3 space-y-2">
              {n > 1 && <div className="text-xs font-medium text-muted-foreground">Item {i + 1}</div>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Problem Reported" value={p[i]} />
                <Field label="Work Requested" value={w[i]} />
              </div>
            </Card>
          ))}
          <Field label="Notes" value={order.notes} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
