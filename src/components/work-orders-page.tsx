/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
  CheckCircle2,
  Clock,
  Pause,
  Play,
  Plus,
  Pencil,
  Trash2,
  Eye,
  Wrench,
  ClipboardCheck,
} from "lucide-react";
import { toast } from "sonner";
import { PaginationBar, PAGE_SIZE, paginate } from "@/components/pagination-bar";
import { ExportMenu } from "@/components/export-menu";
import { WorkOrderDialog } from "@/components/work-order-dialog";
import { SERVICE_TYPES } from "@/lib/service-reports";
import { WO_STATUS, woStatusClasses, woPriorityClasses, splitItems } from "@/lib/work-orders";
import { usePermissions } from "@/hooks/use-permissions";
import { calculateSlaStatus, formatDateTime, normalizePriority, statusBadgeClasses } from "@/lib/fm-sla";

export type ModuleType = "AMC" | "FM";

export function WorkOrdersPage({ moduleType = "AMC" }: { moduleType?: ModuleType }) {
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
    queryKey: ["work_orders", moduleType],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select(
          `
          *,
          contracts:contract_id(id, contract_no, title, customer_name),
          contract_assets:asset_id(id, asset_tag, asset_type, description, location),
          service_categories:service_category_id(id, name),
          ppm_visits:ppm_visit_id(id, planned_date, status)
        `,
        )
        .eq("module_type", moduleType)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: slaPolicies = [] } = useQuery({
    queryKey: ["sla-policies-for-work-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_policies")
        .select("id, name, contract_id, service_category_id, priority, request_type, active")
        .eq("active", true);
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
      return [
        r.wo_no,
        r.customer_name,
        r.technician_name,
        r.location,
        r.contract_assets?.asset_tag,
        r.service_categories?.name,
      ].some((v) => (v ?? "").toString().toLowerCase().includes(q));
    });
  }, [orders, search, typeFilter, statusFilter]);

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const pageRows = paginate(filtered, page);

  const openCount = (orders as any[]).filter(
    (r) => r.status === "Open" || r.status === "Scheduled",
  ).length;
  const inProgress = (orders as any[]).filter((r) => r.status === "In Progress").length;
  const completed = (orders as any[]).filter((r) => r.status === "Completed").length;

  async function remove(id: string) {
    const { error } = await supabase.from("work_orders").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Work order deleted");
    qc.invalidateQueries({ queryKey: ["work_orders"] });
  }

  async function logSlaEvent(order: any, eventType: string, patch: Record<string, any>) {
    const now = new Date().toISOString();
    const policy = matchSlaPolicy(order, slaPolicies);
    const payload: Record<string, any> = {
      ...patch,
      response_sla_status: patch.response_sla_status ?? order.response_sla_status,
      completion_sla_status: patch.completion_sla_status ?? order.completion_sla_status,
    };
    const { error } = await (supabase as any)
      .from("work_orders")
      .update(payload)
      .eq("id", order.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await (supabase as any).from("sla_events").insert({
      work_order_id: order.id,
      contract_id: order.contract_id ?? null,
      sla_policy_id: policy?.id ?? null,
      event_type: eventType,
      event_at: now,
      response_due_at: order.response_due_at ?? null,
      completion_due_at: order.completion_due_at ?? null,
      response_sla_status: payload.response_sla_status ?? null,
      completion_sla_status: payload.completion_sla_status ?? null,
      delay_reason: payload.delay_reason ?? order.delay_reason ?? null,
      exclusion_reason: payload.sla_exclusion_reason ?? order.sla_exclusion_reason ?? null,
    });
    toast.success("Work order updated");
    qc.invalidateQueries({ queryKey: ["work_orders"] });
    qc.invalidateQueries({ queryKey: ["sla-tracker-work-orders"] });
  }

  function timestampActions(order: any) {
    const now = new Date().toISOString();
    const paused = Boolean(order.delay_reason || order.sla_exclusion_reason);
    const responseStatus = calculateSlaStatus({
      dueAt: order.response_due_at,
      actualAt: now,
      paused,
    });
    const completionStatus = calculateSlaStatus({
      dueAt: order.completion_due_at,
      actualAt: now,
      paused,
    });
    return (
      <>
        <Button
          size="sm"
          variant="outline"
          title="Acknowledge"
          onClick={() => logSlaEvent(order, "Acknowledged", { status: "In Progress" })}
        >
          <Clock className="h-3 w-3 mr-1" /> Ack
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Mark responded"
          onClick={() =>
            logSlaEvent(order, "Responded", {
              responded_at: now,
              response_sla_status: responseStatus,
              status: "In Progress",
            })
          }
        >
          Responded
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Mark arrived"
          onClick={() => logSlaEvent(order, "Arrived", { arrived_at: now, status: "In Progress" })}
        >
          Arrived
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Mark completed"
          onClick={() =>
            logSlaEvent(order, "Completed", {
              completed_at: now,
              completion_sla_status: completionStatus,
              status: "Completed",
            })
          }
        >
          <CheckCircle2 className="h-3 w-3 mr-1" /> Done
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Pause SLA"
          onClick={() =>
            logSlaEvent(order, "Paused", {
              delay_reason: order.delay_reason || "Paused",
              response_sla_status: "Paused",
              completion_sla_status: "Paused",
            })
          }
        >
          <Pause className="h-3 w-3" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          title="Resume SLA"
          onClick={() =>
            logSlaEvent(order, "Resumed", {
              delay_reason: null,
              sla_exclusion_reason: null,
              response_sla_status: calculateSlaStatus({
                dueAt: order.response_due_at,
                actualAt: order.responded_at,
              }),
              completion_sla_status: calculateSlaStatus({
                dueAt: order.completion_due_at,
                actualAt: order.completed_at,
              }),
            })
          }
        >
          <Play className="h-3 w-3" />
        </Button>
      </>
    );
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
              { key: "request_type", label: "Request Type" },
              { key: "response_sla_status", label: "Response SLA" },
              { key: "completion_sla_status", label: "Completion SLA" },
              { key: "status", label: "Status" },
            ]}
          />
          {can("service", "add") && (
            <Button
              onClick={() => {
                setEditing(null);
                setOpen(true);
              }}
            >
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
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
          }}
          className="md:max-w-sm"
        />
        <Select
          value={typeFilter}
          onValueChange={(v) => {
            setTypeFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-56">
            <SelectValue placeholder="Service type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All service types</SelectItem>
            {SERVICE_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter}
          onValueChange={(v) => {
            setStatusFilter(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="md:w-44">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {WO_STATUS.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
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
              <TableHead>Request</TableHead>
              <TableHead>Response SLA</TableHead>
              <TableHead>Completion SLA</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-80 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                  No work orders yet.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((r: any) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.wo_no ?? "—"}</TableCell>
                  <TableCell>{r.requested_date ?? "—"}</TableCell>
                  <TableCell>{r.scheduled_date ?? "—"}</TableCell>
                  <TableCell>{r.customer_name ?? "—"}</TableCell>
                  <TableCell>
                    {r.service_type ? (
                      <Badge variant="secondary" className="gap-1">
                        <Wrench className="h-3 w-3" />
                        {r.service_type}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>{r.technician_name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={woPriorityClasses(r.priority)}>
                      {r.priority}
                    </Badge>
                  </TableCell>
                  <TableCell>{r.request_type ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={statusBadgeClasses(r.response_sla_status)}>
                      {r.response_sla_status ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusBadgeClasses(r.completion_sla_status)}
                    >
                      {r.completion_sla_status ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className={woStatusClasses(r.status)}>
                      {r.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {timestampActions(r)}
                      <Button
                        size="icon"
                        variant="ghost"
                        title="View"
                        onClick={() => setViewing(r)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {can("service", "add") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Create work completion report"
                          onClick={() => navigate({ to: "/amc-service-reports", search: { wo: r.id } as any })}
                        >
                          <ClipboardCheck className="h-4 w-4" />
                        </Button>
                      )}
                      {can("service", "edit") && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Edit"
                          onClick={() => {
                            setEditing(r);
                            setOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {can("service", "delete") && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" title="Delete">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete work order?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => remove(r.id)}>
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        <PaginationBar page={page} total={total} onPageChange={setPage} />
      </Card>

      <WorkOrderDialog open={open} onOpenChange={setOpen} editing={editing} moduleType={moduleType} />
      <WorkOrderView order={viewing} policies={slaPolicies} onClose={() => setViewing(null)} />
    </div>
  );
}

function matchSlaPolicy(order: any, policies: any[]) {
  return (
    policies.find((policy) => {
      if (policy.contract_id !== order?.contract_id) return false;
      const categoryMatch =
        !policy.service_category_id || policy.service_category_id === order?.service_category_id;
      const priorityMatch =
        !policy.priority ||
        policy.priority === order?.priority ||
        policy.priority === normalizePriority(order?.priority);
      const requestTypeMatch = !policy.request_type || policy.request_type === order?.request_type;
      return categoryMatch && priorityMatch && requestTypeMatch;
    }) ?? null
  );
}

function WorkOrderView({
  order,
  policies,
  onClose,
}: {
  order: any | null;
  policies: any[];
  onClose: () => void;
}) {
  if (!order) return null;
  const slaPolicy = matchSlaPolicy(order, policies);
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
    <Dialog
      open={Boolean(order)}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
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
            <Field
              label="Contract"
              value={order.contracts?.contract_no ?? order.contracts?.title}
            />
            <Field
              label="Asset"
              value={order.contract_assets?.asset_tag ?? order.contract_assets?.description}
            />
            <Field label="Service Category" value={order.service_categories?.name} />
            <Field label="SLA Policy" value={slaPolicy?.name} />
            <Field label="Service Type" value={order.service_type} />
            <Field label="Request Type" value={order.request_type} />
            <Field label="Location / Unit" value={order.location} />
            <Field label="Priority" value={order.priority} />
            <Field label="Status" value={order.status} />
            <Field label="Reported At" value={formatDateTime(order.reported_at)} />
            <Field label="Response Due" value={formatDateTime(order.response_due_at)} />
            <Field label="Completion Due" value={formatDateTime(order.completion_due_at)} />
            <Field label="Responded At" value={formatDateTime(order.responded_at)} />
            <Field label="Arrived At" value={formatDateTime(order.arrived_at)} />
            <Field label="Completed At" value={formatDateTime(order.completed_at)} />
            <Field label="Response SLA" value={order.response_sla_status} />
            <Field label="Completion SLA" value={order.completion_sla_status} />
            <Field label="Delay Reason" value={order.delay_reason} />
            <Field label="SLA Exclusion" value={order.sla_exclusion_reason} />
          </div>
          {Array.from({ length: n }).map((_, i) => (
            <Card key={i} className="p-3 space-y-2">
              {n > 1 && (
                <div className="text-xs font-medium text-muted-foreground">Item {i + 1}</div>
              )}
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
