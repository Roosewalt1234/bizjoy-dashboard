/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Loader2, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { SERVICE_TYPES } from "@/lib/service-reports";
import { WO_STATUS, WO_PRIORITY, ITEM_SEP, splitItems } from "@/lib/work-orders";
import { nextDocNo } from "@/lib/doc-no";
import {
  calculateDueTimes,
  calculateSlaStatus,
  normalizePriority,
  SLA_REQUEST_TYPES,
} from "@/lib/fm-sla";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
};

const empty = {
  wo_no: "",
  contract_id: "",
  asset_id: "",
  ppm_visit_id: "",
  service_category_id: "",
  customer_id: "",
  customer_name: "",
  requested_date: new Date().toISOString().slice(0, 10),
  scheduled_date: "",
  request_type: "Reactive",
  reported_at: "",
  responded_at: "",
  arrived_at: "",
  completed_at: "",
  response_due_at: "",
  completion_due_at: "",
  response_sla_status: "",
  completion_sla_status: "",
  delay_reason: "",
  sla_exclusion_reason: "",
  technician_id: "",
  technician_name: "",
  service_type: "",
  location: "",
  priority: "Medium",
  notes: "",
  status: "Open",
};

type WorkItem = { problem: string; work: string };
const emptyItem = (): WorkItem => ({ problem: "", work: "" });

function itemsFromRow(r: any): WorkItem[] {
  const p = splitItems(r?.problem_reported);
  const w = splitItems(r?.work_requested);
  const n = Math.max(p.length, w.length, 1);
  return Array.from({ length: n }).map((_, i) => ({ problem: p[i] ?? "", work: w[i] ?? "" }));
}

export function WorkOrderDialog({ open, onOpenChange, editing, moduleType = "AMC" }: Props & { moduleType?: "AMC" | "FM" }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(empty);
  const [items, setItems] = useState<WorkItem[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [technicianOpen, setTechnicianOpen] = useState(false);

  const { data: contracts = [] } = useQuery({
    queryKey: ["contracts-for-service"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, contract_no, customer_id, customer_name")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: technicians = [] } = useQuery({
    queryKey: ["employees-for-work-order"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, full_name")
        .eq("status", "Active")
        .order("first_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((e: any) => ({
        id: e.id,
        name: e.full_name ?? [e.first_name, e.last_name].filter(Boolean).join(" "),
      }));
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["contract-assets-for-work-order", form.contract_id],
    enabled: !!form.contract_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contract_assets")
        .select("id, asset_tag, asset_type, description, location, service_category_id")
        .eq("contract_id", form.contract_id)
        .order("asset_tag", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["service-categories-for-work-order"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("service_categories")
        .select("id, name, code")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: ppmVisits = [] } = useQuery({
    queryKey: ["ppm-visits-for-work-order", form.contract_id],
    enabled: !!form.contract_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("ppm_visits")
        .select("id, planned_date, due_date, asset_id, service_category_id, status")
        .eq("contract_id", form.contract_id)
        .order("planned_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...empty,
        ...editing,
        contract_id: editing.contract_id ?? "",
        customer_id: editing.customer_id ?? "",
      });
      setItems(itemsFromRow(editing));
    } else {
      setForm(empty);
      setItems([emptyItem()]);
      nextDocNo("work_order")
        .then((no) => setForm((f: any) => ({ ...f, wo_no: no })))
        .catch(() => {});
    }
  }, [open, editing]);

  function set(key: string, value: any) {
    setForm((f: any) => ({ ...f, [key]: value }));
  }

  function pickContract(id: string) {
    const c: any = contracts.find((x: any) => x.id === id);
    setForm((f: any) => ({
      ...f,
      contract_id: id,
      asset_id: "",
      ppm_visit_id: "",
      service_category_id: "",
      customer_id: c?.customer_id ?? f.customer_id,
      customer_name: c?.customer_name ?? f.customer_name,
    }));
  }

  function pickAsset(id: string) {
    const asset: any = assets.find((x: any) => x.id === id);
    setForm((f: any) => ({
      ...f,
      asset_id: id,
      service_category_id: asset?.service_category_id ?? f.service_category_id,
      location: asset?.location ?? f.location,
    }));
  }

  function pickPpmVisit(id: string) {
    const visit: any = ppmVisits.find((x: any) => x.id === id);
    setForm((f: any) => ({
      ...f,
      ppm_visit_id: id,
      asset_id: visit?.asset_id ?? f.asset_id,
      service_category_id: visit?.service_category_id ?? f.service_category_id,
      request_type: "PPM",
      reported_at: visit?.planned_date
        ? new Date(`${visit.planned_date}T09:00:00`).toISOString()
        : f.reported_at,
      scheduled_date: visit?.planned_date ?? f.scheduled_date,
    }));
  }

  async function findSlaPolicy(payload: any) {
    if (!payload.contract_id) return null;
    const priority = normalizePriority(payload.priority);
    const requestType = payload.request_type || "Reactive";
    const { data, error } = await (supabase as any)
      .from("sla_policies")
      .select("*")
      .eq("active", true)
      .eq("contract_id", payload.contract_id)
      .order("service_category_id", { ascending: false });
    if (error) throw error;
    return (
      (data ?? []).find((policy: any) => {
        const categoryMatch =
          !policy.service_category_id || policy.service_category_id === payload.service_category_id;
        const priorityMatch =
          !policy.priority || policy.priority === priority || policy.priority === payload.priority;
        const typeMatch = !policy.request_type || policy.request_type === requestType;
        return categoryMatch && priorityMatch && typeMatch;
      }) ?? null
    );
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const kept = items.filter((it) => it.problem || it.work);
      const list = kept.length ? kept : [emptyItem()];
      const payload: any = {
        wo_no: form.wo_no || null,
        contract_id: form.contract_id || null,
        asset_id: form.asset_id || null,
        ppm_visit_id: form.ppm_visit_id || null,
        service_category_id: form.service_category_id || null,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name || null,
        requested_date: form.requested_date || null,
        scheduled_date: form.scheduled_date || null,
        request_type: form.request_type || null,
        reported_at:
          form.reported_at ||
          (form.request_type === "PPM" && form.scheduled_date
            ? new Date(`${form.scheduled_date}T09:00:00`).toISOString()
            : new Date().toISOString()),
        responded_at: form.responded_at || null,
        arrived_at: form.arrived_at || null,
        completed_at: form.completed_at || null,
        delay_reason: form.delay_reason || null,
        sla_exclusion_reason: form.sla_exclusion_reason || null,
        technician_id: form.technician_id || null,
        technician_name: form.technician_name || null,
        service_type: form.service_type || null,
        location: form.location || null,
        priority: form.priority || "Medium",
        problem_reported: list.map((it) => it.problem).join(ITEM_SEP) || null,
        work_requested: list.map((it) => it.work).join(ITEM_SEP) || null,
        notes: form.notes || null,
        status: form.status || "Open",
      };

      const policy = await findSlaPolicy(payload);
      if (policy) {
        const dueTimes = calculateDueTimes(payload.reported_at, policy);
        payload.response_due_at = dueTimes.response_due_at;
        payload.completion_due_at = dueTimes.completion_due_at;
        payload.response_sla_status = calculateSlaStatus({
          dueAt: payload.response_due_at,
          actualAt: payload.responded_at,
          paused: Boolean(payload.delay_reason || payload.sla_exclusion_reason),
        });
        payload.completion_sla_status = calculateSlaStatus({
          dueAt: payload.completion_due_at,
          actualAt: payload.completed_at,
          paused: Boolean(payload.delay_reason || payload.sla_exclusion_reason),
        });
      } else {
        payload.response_due_at = form.response_due_at || null;
        payload.completion_due_at = form.completion_due_at || null;
        payload.response_sla_status = form.response_sla_status || null;
        payload.completion_sla_status = form.completion_sla_status || null;
      }

      if (editing?.id) {
        const { error } = await supabase.from("work_orders").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("work_orders").insert({ ...payload, module_type: moduleType });
        if (error) throw error;
      }

      if (!policy && payload.contract_id) {
        toast.warning("No SLA policy found. Work order saved without SLA due times.");
      }
      toast.success(editing ? "Work order updated" : "Work order created");
      qc.invalidateQueries({ queryKey: ["work_orders"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Work Order" : "New Work Order"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              Job details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Work Order No</Label>
                <Input
                  value={form.wo_no ?? ""}
                  readOnly
                  className="bg-muted"
                  placeholder="Auto-generated"
                />
              </div>
              <div className="space-y-1">
                <Label>Requested Date</Label>
                <Input
                  type="date"
                  value={form.requested_date ?? ""}
                  onChange={(e) => set("requested_date", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Scheduled Date</Label>
                <Input
                  type="date"
                  value={form.scheduled_date ?? ""}
                  onChange={(e) => set("scheduled_date", e.target.value)}
                />
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Contract</Label>
                <Select value={form.contract_id || undefined} onValueChange={pickContract}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select contract..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {contracts.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {(c.contract_no ? `${c.contract_no} — ` : "") +
                          (c.customer_name ?? c.title ?? "Untitled")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Customer</Label>
                <Input
                  value={form.customer_name ?? ""}
                  onChange={(e) => set("customer_name", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Service Type</Label>
                <Select
                  value={form.service_type || undefined}
                  onValueChange={(v) => set("service_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {SERVICE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Request Type</Label>
                <Select
                  value={form.request_type || undefined}
                  onValueChange={(v) => set("request_type", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Request type" />
                  </SelectTrigger>
                  <SelectContent>
                    {SLA_REQUEST_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Asset</Label>
                <Select
                  value={form.asset_id || undefined}
                  onValueChange={pickAsset}
                  disabled={!form.contract_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select asset..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {assets.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        {[a.asset_tag, a.asset_type, a.description].filter(Boolean).join(" - ") ||
                          "Asset"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Service Category</Label>
                <Select
                  value={form.service_category_id || undefined}
                  onValueChange={(v) => set("service_category_id", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {categories.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>PPM Visit</Label>
                <Select
                  value={form.ppm_visit_id || undefined}
                  onValueChange={pickPpmVisit}
                  disabled={!form.contract_id}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Optional PPM visit..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-72">
                    {ppmVisits.map((v: any) => (
                      <SelectItem key={v.id} value={v.id}>
                        {`${v.planned_date} - ${v.status}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Location / Unit</Label>
                <Input
                  value={form.location ?? ""}
                  onChange={(e) => set("location", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Assigned To</Label>
                <Popover open={technicianOpen} onOpenChange={setTechnicianOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                    >
                      {form.technician_name || "Select technician..."}
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search by name..." />
                      <CommandList>
                        <CommandEmpty>No technician found.</CommandEmpty>
                        <CommandGroup>
                          {technicians.map((tech: any) => (
                            <CommandItem
                              key={tech.id}
                              onSelect={() => {
                                setForm((f: any) => ({
                                  ...f,
                                  technician_id: tech.id,
                                  technician_name: tech.name,
                                }));
                                setTechnicianOpen(false);
                              }}
                            >
                              {tech.name}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select
                  value={form.priority || undefined}
                  onValueChange={(v) => set("priority", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    {[...WO_PRIORITY, "P1 Critical", "P2 High", "P3 Medium", "P4 Low"].map((p) => (
                      <SelectItem key={p} value={p}>
                        {p}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status || undefined} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {WO_STATUS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
              SLA tracking
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Reported At</Label>
                <Input
                  type="datetime-local"
                  value={(form.reported_at ?? "").slice(0, 16)}
                  onChange={(e) =>
                    set("reported_at", e.target.value ? new Date(e.target.value).toISOString() : "")
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Responded At</Label>
                <Input
                  type="datetime-local"
                  value={(form.responded_at ?? "").slice(0, 16)}
                  onChange={(e) =>
                    set(
                      "responded_at",
                      e.target.value ? new Date(e.target.value).toISOString() : "",
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Arrived At</Label>
                <Input
                  type="datetime-local"
                  value={(form.arrived_at ?? "").slice(0, 16)}
                  onChange={(e) =>
                    set("arrived_at", e.target.value ? new Date(e.target.value).toISOString() : "")
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Completed At</Label>
                <Input
                  type="datetime-local"
                  value={(form.completed_at ?? "").slice(0, 16)}
                  onChange={(e) =>
                    set(
                      "completed_at",
                      e.target.value ? new Date(e.target.value).toISOString() : "",
                    )
                  }
                />
              </div>
              <div className="space-y-1">
                <Label>Delay Reason</Label>
                <Input
                  value={form.delay_reason ?? ""}
                  onChange={(e) => set("delay_reason", e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>SLA Exclusion Reason</Label>
                <Input
                  value={form.sla_exclusion_reason ?? ""}
                  onChange={(e) => set("sla_exclusion_reason", e.target.value)}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Work requested
              </h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setItems((a) => [...a, emptyItem()])}
              >
                <Plus className="h-4 w-4 mr-1" /> Add work item
              </Button>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => {
                const upd = (k: keyof WorkItem, v: string) =>
                  setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, [k]: v } : x)));
                return (
                  <Card key={idx} className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Item {idx + 1}
                      </span>
                      {items.length > 1 && (
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Problem Reported</Label>
                        <Textarea
                          rows={3}
                          value={it.problem}
                          onChange={(e) => upd("problem", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Work Requested</Label>
                        <Textarea
                          rows={3}
                          value={it.work}
                          onChange={(e) => upd("work", e.target.value)}
                        />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-1">
            <Label>Notes</Label>
            <Textarea
              rows={3}
              value={form.notes ?? ""}
              onChange={(e) => set("notes", e.target.value)}
            />
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Update Work Order" : "Create Work Order"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
