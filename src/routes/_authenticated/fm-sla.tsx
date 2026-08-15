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
import {
  calculateSlaStatus,
  formatDateTime,
  normalizePriority,
  SLA_PRIORITIES,
  SLA_REQUEST_TYPES,
  statusBadgeClasses,
} from "@/lib/fm-sla";

export const Route = createFileRoute("/_authenticated/fm-sla")({
  component: ContractSlaPage,
});

type ContractLookup = {
  id: string;
  title: string | null;
  contract_no: string | null;
  customer_name: string | null;
};
type ServiceCategory = { id: string; name: string };
type SlaPolicy = {
  id: string;
  contract_id: string | null;
  service_category_id: string | null;
  name: string;
  priority: string | null;
  request_type: string | null;
  response_minutes: number | null;
  completion_minutes: number | null;
  response_hours: number | null;
  completion_hours: number | null;
  active: boolean;
  contracts?: ContractLookup | null;
  service_categories?: ServiceCategory | null;
};

const emptyPolicy = {
  contract_id: "",
  service_category_id: "all",
  name: "",
  priority: "P3 Medium",
  request_type: "Reactive",
  response_minutes: "120",
  completion_minutes: "1440",
  active: "true",
};

function ContractSlaPage() {
  const qc = useQueryClient();
  const [contractFilter, setContractFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [requestTypeFilter, setRequestTypeFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState(new Date().toISOString().slice(0, 7));
  const [page, setPage] = useState(1);
  const [trackerPage, setTrackerPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<SlaPolicy | null>(null);
  const [form, setForm] = useState(emptyPolicy);
  const [saving, setSaving] = useState(false);
  const [addingTemplate, setAddingTemplate] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-lookup-sla"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, contract_no, customer_name")
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return (data ?? []) as ContractLookup[];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["service-categories-lookup-sla"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("service_categories")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ServiceCategory[];
    },
  });

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["sla_policies"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("sla_policies")
        .select(
          "*, contracts:contract_id(id, title, contract_no, customer_name), service_categories:service_category_id(id, name)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SlaPolicy[];
    },
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ["sla-tracker-work-orders"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("work_orders")
        .select(
          "*, contracts:contract_id(id, title, contract_no, customer_name), contract_assets:asset_id(id, asset_tag, asset_type, description), service_categories:service_category_id(id, name)",
        )
        .order("reported_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const filteredPolicies = useMemo(
    () =>
      policies.filter((policy) => {
        if (contractFilter !== "all" && policy.contract_id !== contractFilter) return false;
        if (categoryFilter !== "all" && policy.service_category_id !== categoryFilter) return false;
        if (priorityFilter !== "all" && policy.priority !== priorityFilter) return false;
        return true;
      }),
    [policies, contractFilter, categoryFilter, priorityFilter],
  );

  const trackerRows = useMemo(
    () =>
      (workOrders as any[])
        .filter((row) => {
          if (contractFilter !== "all" && row.contract_id !== contractFilter) return false;
          if (categoryFilter !== "all" && row.service_category_id !== categoryFilter) return false;
          if (priorityFilter !== "all" && normalizePriority(row.priority) !== priorityFilter)
            return false;
          if (requestTypeFilter !== "all" && row.request_type !== requestTypeFilter) return false;
          const dateKey = (row.reported_at ?? row.scheduled_date ?? row.requested_date ?? "").slice(
            0,
            7,
          );
          return !monthFilter || dateKey === monthFilter;
        })
        .map((row) => {
          const paused = Boolean(row.delay_reason || row.sla_exclusion_reason);
          return {
            ...row,
            computed_response_sla: calculateSlaStatus({
              dueAt: row.response_due_at,
              actualAt: row.responded_at,
              paused,
            }),
            computed_completion_sla: calculateSlaStatus({
              dueAt: row.completion_due_at,
              actualAt: row.completed_at,
              paused,
            }),
          };
        }),
    [workOrders, contractFilter, categoryFilter, priorityFilter, requestTypeFilter, monthFilter],
  );

  const policyPages = Math.max(1, Math.ceil(filteredPolicies.length / PAGE_SIZE));
  const trackerPages = Math.max(1, Math.ceil(trackerRows.length / PAGE_SIZE));
  useEffect(() => {
    if (page > policyPages) setPage(policyPages);
  }, [page, policyPages]);
  useEffect(() => {
    if (trackerPage > trackerPages) setTrackerPage(trackerPages);
  }, [trackerPage, trackerPages]);

  const openOrders = trackerRows.filter(
    (row) => row.status !== "Completed" && row.status !== "Cancelled",
  );
  const breachedResponse = trackerRows.filter(
    (row) => row.computed_response_sla === "Breached",
  ).length;
  const breachedCompletion = trackerRows.filter(
    (row) => row.computed_completion_sla === "Breached",
  ).length;
  const atRisk = trackerRows.filter(
    (row) => row.computed_response_sla === "At Risk" || row.computed_completion_sla === "At Risk",
  ).length;
  const within = trackerRows.filter(
    (row) =>
      row.computed_response_sla === "Within SLA" || row.computed_completion_sla === "Within SLA",
  ).length;
  const measured = trackerRows.filter(
    (row) =>
      row.computed_response_sla !== "Not Applicable" ||
      row.computed_completion_sla !== "Not Applicable",
  ).length;
  const compliance = measured ? Math.round((within / measured) * 100) : 0;

  function startCreate() {
    setEditing(null);
    setForm({
      ...emptyPolicy,
      contract_id: contractFilter === "all" ? "" : contractFilter,
      service_category_id: categoryFilter,
    });
    setOpen(true);
  }

  function startEdit(policy: SlaPolicy) {
    setEditing(policy);
    setForm({
      contract_id: policy.contract_id ?? "",
      service_category_id: policy.service_category_id ?? "all",
      name: policy.name ?? "",
      priority: policy.priority ?? "P3 Medium",
      request_type: policy.request_type ?? "Reactive",
      response_minutes: String(
        (policy.response_minutes ?? Number(policy.response_hours ?? 0) * 60) || "",
      ),
      completion_minutes: String(
        (policy.completion_minutes ?? Number(policy.completion_hours ?? 0) * 60) || "",
      ),
      active: String(policy.active ?? true),
    });
    setOpen(true);
  }

  async function savePolicy() {
    if (!form.contract_id) {
      toast.error("Select a contract");
      return;
    }
    if (!form.name.trim()) {
      toast.error("Enter a policy name");
      return;
    }
    setSaving(true);
    try {
      const responseMinutes = Number(form.response_minutes) || null;
      const completionMinutes = Number(form.completion_minutes) || null;
      const payload = {
        contract_id: form.contract_id,
        service_category_id: form.service_category_id === "all" ? null : form.service_category_id,
        name: form.name.trim(),
        priority: form.priority,
        request_type: form.request_type,
        response_minutes: responseMinutes,
        completion_minutes: completionMinutes,
        response_hours: responseMinutes == null ? null : responseMinutes / 60,
        completion_hours: completionMinutes == null ? null : completionMinutes / 60,
        active: form.active === "true",
      };
      const query = editing
        ? (supabase as any).from("sla_policies").update(payload).eq("id", editing.id)
        : (supabase as any).from("sla_policies").insert(payload);
      const { error } = await query;
      if (error) throw error;
      toast.success(editing ? "SLA policy updated" : "SLA policy added");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["sla_policies"] });
    } catch (error: any) {
      toast.error(error.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function removePolicy(policy: SlaPolicy) {
    const { error } = await (supabase as any).from("sla_policies").delete().eq("id", policy.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("SLA policy deleted");
    qc.invalidateQueries({ queryKey: ["sla_policies"] });
  }

  async function addParksideTemplate() {
    if (contractFilter === "all") return;
    setAddingTemplate(true);
    try {
      const rows = [
        ["P1 Critical", 30, 240],
        ["P2 High", 60, 480],
        ["P3 Medium", 120, 1440],
        ["P4 Low", 1440, 7200],
      ].map(([priority, response, completion]) => ({
        contract_id: contractFilter,
        service_category_id: null,
        name: `48 Parkside ${priority}`,
        priority,
        request_type: "Reactive",
        response_minutes: response,
        completion_minutes: completion,
        response_hours: Number(response) / 60,
        completion_hours: Number(completion) / 60,
        active: true,
      }));
      const { error } = await (supabase as any).from("sla_policies").insert(rows);
      if (error) throw error;
      toast.success("48 Parkside SLA template added");
      qc.invalidateQueries({ queryKey: ["sla_policies"] });
    } catch (error: any) {
      toast.error(error.message ?? "Template insert failed");
    } finally {
      setAddingTemplate(false);
    }
  }

  const filterPanel = (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        <FilterSelect
          label="Contract"
          value={contractFilter}
          onValueChange={(value) => {
            setContractFilter(value);
            setPage(1);
            setTrackerPage(1);
          }}
        >
          <SelectItem value="all">All Contracts</SelectItem>
          {contracts.map((contract) => (
            <SelectItem key={contract.id} value={contract.id}>
              {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                (contract.customer_name ?? contract.title ?? "Untitled")}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Service Category"
          value={categoryFilter}
          onValueChange={(value) => {
            setCategoryFilter(value);
            setPage(1);
            setTrackerPage(1);
          }}
        >
          <SelectItem value="all">All Categories</SelectItem>
          {categories.map((category) => (
            <SelectItem key={category.id} value={category.id}>
              {category.name}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Priority"
          value={priorityFilter}
          onValueChange={(value) => {
            setPriorityFilter(value);
            setPage(1);
            setTrackerPage(1);
          }}
        >
          <SelectItem value="all">All Priorities</SelectItem>
          {SLA_PRIORITIES.map((priority) => (
            <SelectItem key={priority} value={priority}>
              {priority}
            </SelectItem>
          ))}
        </FilterSelect>
        <FilterSelect
          label="Request Type"
          value={requestTypeFilter}
          onValueChange={(value) => {
            setRequestTypeFilter(value);
            setTrackerPage(1);
          }}
        >
          <SelectItem value="all">All Request Types</SelectItem>
          {SLA_REQUEST_TYPES.map((type) => (
            <SelectItem key={type} value={type}>
              {type}
            </SelectItem>
          ))}
        </FilterSelect>
        <div>
          <Label className="text-xs">Month</Label>
          <Input
            type="month"
            value={monthFilter}
            onChange={(event) => {
              setMonthFilter(event.target.value);
              setTrackerPage(1);
            }}
          />
        </div>
      </div>
    </Card>
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-4">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">SLA & KPI Tracker</h1>
        <p className="text-muted-foreground">
          Manage FM SLA policies and track work-order compliance.
        </p>
      </div>

      <Tabs defaultValue="policies" className="space-y-4">
        <TabsList>
          <TabsTrigger value="policies">SLA Policies</TabsTrigger>
          <TabsTrigger value="tracker">SLA Tracker</TabsTrigger>
        </TabsList>

        <TabsContent value="policies" className="space-y-4">
          <div className="flex justify-end gap-2">
            <ExportMenu
              filename="sla-policies"
              sheetName="SLA Policies"
              rows={filteredPolicies}
              columns={[
                { key: "name", label: "Name" },
                { key: "priority", label: "Priority" },
                { key: "request_type", label: "Request Type" },
                { key: "response_minutes", label: "Response Minutes" },
                { key: "completion_minutes", label: "Completion Minutes" },
                { key: "active", label: "Active" },
              ]}
            />
            {contractFilter !== "all" && (
              <Button variant="outline" onClick={addParksideTemplate} disabled={addingTemplate}>
                Add 48 Parkside SLA Template
              </Button>
            )}
            <Button onClick={startCreate}>
              <Plus className="h-4 w-4 mr-2" /> Add Policy
            </Button>
          </div>
          {filterPanel}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Request Type</TableHead>
                  <TableHead>Response</TableHead>
                  <TableHead>Completion</TableHead>
                  <TableHead>Status</TableHead>
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
                ) : paginate(filteredPolicies, page).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No SLA policies found.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginate(filteredPolicies, page).map((policy) => (
                    <TableRow key={policy.id}>
                      <TableCell className="font-medium">{policy.name}</TableCell>
                      <TableCell>
                        {policy.contracts?.contract_no ?? policy.contracts?.customer_name ?? "-"}
                      </TableCell>
                      <TableCell>{policy.service_categories?.name ?? "All"}</TableCell>
                      <TableCell>{policy.priority ?? "-"}</TableCell>
                      <TableCell>{policy.request_type ?? "-"}</TableCell>
                      <TableCell>
                        {policy.response_minutes ?? Number(policy.response_hours ?? 0) * 60} min
                      </TableCell>
                      <TableCell>
                        {policy.completion_minutes ?? Number(policy.completion_hours ?? 0) * 60} min
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{policy.active ? "Active" : "Inactive"}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => startEdit(policy)}>
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
                                <AlertDialogTitle>Delete SLA policy?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This cannot be undone.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => removePolicy(policy)}>
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationBar page={page} total={filteredPolicies.length} onPageChange={setPage} />
          </Card>
        </TabsContent>

        <TabsContent value="tracker" className="space-y-4">
          <div className="flex justify-end">
            <ExportMenu
              filename="sla-tracker"
              sheetName="SLA Tracker"
              rows={trackerRows}
              columns={[
                { key: "wo_no", label: "WO No" },
                { key: "priority", label: "Priority" },
                { key: "request_type", label: "Request Type" },
                { key: "reported_at", label: "Reported At" },
                { key: "response_due_at", label: "Response Due" },
                { key: "completion_due_at", label: "Completion Due" },
                { key: "responded_at", label: "Responded At" },
                { key: "completed_at", label: "Completed At" },
                { key: "computed_response_sla", label: "Response SLA" },
                { key: "computed_completion_sla", label: "Completion SLA" },
                { key: "status", label: "Status" },
              ]}
            />
          </div>
          {filterPanel}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
            <Metric label="Total WOs" value={trackerRows.length} />
            <Metric label="Open WOs" value={openOrders.length} />
            <Metric label="Response Breaches" value={breachedResponse} tone="danger" />
            <Metric label="Completion Breaches" value={breachedCompletion} tone="danger" />
            <Metric label="At Risk" value={atRisk} tone="warning" />
            <Metric label="SLA Compliance" value={`${compliance}%`} tone="success" />
          </div>
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO No</TableHead>
                  <TableHead>Contract</TableHead>
                  <TableHead>Asset</TableHead>
                  <TableHead>Service Category</TableHead>
                  <TableHead>Priority</TableHead>
                  <TableHead>Request Type</TableHead>
                  <TableHead>Reported At</TableHead>
                  <TableHead>Response Due</TableHead>
                  <TableHead>Completion Due</TableHead>
                  <TableHead>Responded At</TableHead>
                  <TableHead>Completed At</TableHead>
                  <TableHead>Response SLA</TableHead>
                  <TableHead>Completion SLA</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginate(trackerRows, trackerPage).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-8 text-muted-foreground">
                      No work orders match the filters.
                    </TableCell>
                  </TableRow>
                ) : (
                  paginate(trackerRows, trackerPage).map((row: any) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.wo_no ?? "-"}</TableCell>
                      <TableCell>
                        {row.contracts?.contract_no ?? row.contracts?.customer_name ?? "-"}
                      </TableCell>
                      <TableCell>
                        {row.contract_assets?.asset_tag ?? row.contract_assets?.description ?? "-"}
                      </TableCell>
                      <TableCell>{row.service_categories?.name ?? "-"}</TableCell>
                      <TableCell>{normalizePriority(row.priority)}</TableCell>
                      <TableCell>{row.request_type ?? "-"}</TableCell>
                      <TableCell>{formatDateTime(row.reported_at)}</TableCell>
                      <TableCell>{formatDateTime(row.response_due_at)}</TableCell>
                      <TableCell>{formatDateTime(row.completion_due_at)}</TableCell>
                      <TableCell>{formatDateTime(row.responded_at)}</TableCell>
                      <TableCell>{formatDateTime(row.completed_at)}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusBadgeClasses(row.computed_response_sla)}
                        >
                          {row.computed_response_sla}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusBadgeClasses(row.computed_completion_sla)}
                        >
                          {row.computed_completion_sla}
                        </Badge>
                      </TableCell>
                      <TableCell>{row.status ?? "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            <PaginationBar
              page={trackerPage}
              total={trackerRows.length}
              onPageChange={setTrackerPage}
            />
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit SLA Policy" : "Add SLA Policy"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Policy Name">
              <Input
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </Field>
            <Field label="Contract">
              <Select
                value={form.contract_id || undefined}
                onValueChange={(value) => setForm((prev) => ({ ...prev, contract_id: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select contract..." />
                </SelectTrigger>
                <SelectContent>
                  {contracts.map((contract) => (
                    <SelectItem key={contract.id} value={contract.id}>
                      {(contract.contract_no ? `${contract.contract_no} - ` : "") +
                        (contract.customer_name ?? contract.title ?? "Untitled")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <FilterSelect
              label="Service Category"
              value={form.service_category_id}
              onValueChange={(value) =>
                setForm((prev) => ({ ...prev, service_category_id: value }))
              }
            >
              <SelectItem value="all">All Categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Priority"
              value={form.priority}
              onValueChange={(value) => setForm((prev) => ({ ...prev, priority: value }))}
            >
              {SLA_PRIORITIES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  {priority}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Request Type"
              value={form.request_type}
              onValueChange={(value) => setForm((prev) => ({ ...prev, request_type: value }))}
            >
              {SLA_REQUEST_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Active"
              value={form.active}
              onValueChange={(value) => setForm((prev) => ({ ...prev, active: value }))}
            >
              <SelectItem value="true">Active</SelectItem>
              <SelectItem value="false">Inactive</SelectItem>
            </FilterSelect>
            <Field label="Response Minutes">
              <Input
                type="number"
                min="0"
                value={form.response_minutes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, response_minutes: event.target.value }))
                }
              />
            </Field>
            <Field label="Completion Minutes">
              <Input
                type="number"
                min="0"
                value={form.completion_minutes}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, completion_minutes: event.target.value }))
                }
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={savePolicy} disabled={saving}>
              {saving ? "Saving..." : "Save Policy"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
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

function FilterSelect({
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
