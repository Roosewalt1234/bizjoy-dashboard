/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, ImagePlus, Loader2, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/signature-pad";
import { SERVICE_TYPES, REPORT_STATUS, type PhotoRow } from "@/lib/service-reports";
import {
  COMPLETION_TYPES, type WorkItem, emptyItem, itemsFromReport,
  saveFmServiceReport, nextDocNo,
} from "./fm-service-reports-api";

type FmServiceReportModalProps = {
  open: boolean;
  editing: any | null;
  prefillWorkOrderId?: string | null;
  onOpenChange: (open: boolean) => void;
};

const empty = {
  report_no: "",
  work_order_id: "",
  contract_id: "",
  asset_id: "",
  ppm_visit_id: "",
  service_category_id: "",
  customer_id: "",
  customer_name: "",
  service_date: new Date().toISOString().slice(0, 10),
  technician_name: "",
  service_type: "",
  location: "",
  time_checked_in: "",
  time_checked_out: "",
  completion_type: "",
  client_representative: "",
  defects_found: "",
  follow_up_required: false,
  recommendations: "",
  next_service_date: "",
  signed_by: "",
  signature_data: "",
  status: "Draft",
};

/** The one FM service report create/edit modal - covers work items, photos, and sign-off. */
export function FmServiceReportModal({ open, editing, prefillWorkOrderId, onOpenChange }: FmServiceReportModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(empty);
  const [items, setItems] = useState<WorkItem[]>([emptyItem()]);
  const [photos, setPhotos] = useState<PhotoRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [technicianOpen, setTechnicianOpen] = useState(false);

  const { data: technicians = [] } = useQuery({
    queryKey: ["employees-for-fm-service-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, first_name, last_name, full_name")
        .eq("status", "Active")
        .order("first_name", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((e: any) => e.full_name ?? [e.first_name, e.last_name].filter(Boolean).join(" "));
    },
  });

  const { data: contracts = [] } = useQuery({
    queryKey: ["fm-contracts-for-service-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fm_contracts")
        .select("id, title, contract_no, customer_id, customer_name")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ["fm-work-orders-for-report"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("fm_work_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: assets = [] } = useQuery({
    queryKey: ["contract-assets-for-fm-service-report", form.contract_id],
    enabled: !!form.contract_id,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("contract_assets")
        .select("id, asset_tag, asset_type, description, service_category_id")
        .eq("contract_id", form.contract_id)
        .order("asset_tag", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["service-categories-for-fm-service-report"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("service_categories")
        .select("id, name")
        .eq("active", true)
        .order("name", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  function applyWorkOrder(id: string) {
    const o: any = workOrders.find((x: any) => x.id === id);
    if (!o) { setForm((f: any) => ({ ...f, work_order_id: id })); return; }
    setForm((f: any) => ({
      ...f,
      work_order_id: id,
      contract_id: o.contract_id ?? f.contract_id,
      asset_id: o.asset_id ?? f.asset_id,
      ppm_visit_id: o.ppm_visit_id ?? f.ppm_visit_id,
      service_category_id: o.service_category_id ?? f.service_category_id,
      customer_id: o.customer_id ?? f.customer_id,
      customer_name: o.customer_name ?? f.customer_name,
      technician_name: o.technician_name ?? f.technician_name,
      service_type: o.service_type ?? f.service_type,
      location: o.location ?? f.location,
      service_date: o.scheduled_date ?? f.service_date,
    }));
    const problems = (o.problem_reported ?? "").split("\n---\n");
    const requested = (o.work_requested ?? "").split("\n---\n");
    const n = Math.max(problems.length, requested.length, 1);
    setItems(Array.from({ length: n }).map((_, i) => ({ problem: problems[i] ?? "", work: requested[i] ?? "", parts: "", hours: "" })));
  }

  useEffect(() => {
    if (!open || editing || !prefillWorkOrderId || !workOrders.length) return;
    applyWorkOrder(prefillWorkOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, prefillWorkOrderId, workOrders]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...empty,
        ...editing,
        contract_id: editing.contract_id ?? "",
        asset_id: editing.asset_id ?? "",
        ppm_visit_id: editing.ppm_visit_id ?? "",
        service_category_id: editing.service_category_id ?? "",
        customer_id: editing.customer_id ?? "",
        time_checked_in: (editing.time_checked_in ?? "").slice(0, 5),
        time_checked_out: (editing.time_checked_out ?? "").slice(0, 5),
        follow_up_required: editing.follow_up_required ?? false,
      });
      setItems(itemsFromReport(editing));
      supabase.from("fm_service_report_photos").select("*").eq("report_id", editing.id).order("sort_order")
        .then(({ data }) => setPhotos((data ?? []).map((p: any) => ({ ...p }))));
    } else {
      setForm(empty);
      setItems([emptyItem()]);
      setPhotos([]);
      nextDocNo("service_report").then((no) => setForm((f: any) => ({ ...f, report_no: no }))).catch(() => {});
    }
  }, [open, editing]);

  useEffect(() => {
    const a = form.time_checked_in;
    const b = form.time_checked_out;
    if (!a || !b) return;
    const [ah, am] = a.split(":").map(Number);
    const [bh, bm] = b.split(":").map(Number);
    if ([ah, am, bh, bm].some((n) => Number.isNaN(n))) return;
    let mins = bh * 60 + bm - (ah * 60 + am);
    if (mins < 0) mins += 24 * 60;
    const hrs = Math.round((mins / 60) * 100) / 100;
    setItems((prev) => {
      if (!prev.length) return prev;
      if (String(prev[0].hours) === String(hrs)) return prev;
      const next = [...prev];
      next[0] = { ...next[0], hours: String(hrs) };
      return next;
    });
  }, [form.time_checked_in, form.time_checked_out]);

  function set(key: string, value: any) {
    setForm((f: any) => ({ ...f, [key]: value }));
  }

  function pickContract(id: string) {
    const c: any = contracts.find((x: any) => x.id === id);
    setForm((f: any) => ({ ...f, contract_id: id, asset_id: "", customer_id: c?.customer_id ?? f.customer_id, customer_name: c?.customer_name ?? f.customer_name }));
  }

  function pickAsset(id: string) {
    const asset: any = assets.find((x: any) => x.id === id);
    setForm((f: any) => ({ ...f, asset_id: id, service_category_id: asset?.service_category_id ?? f.service_category_id }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await saveFmServiceReport({ ...form, items, photos }, editing?.id);
      toast.success(editing ? "Report updated" : "Report created");
      qc.invalidateQueries({ queryKey: ["fm_service_reports"] });
      qc.invalidateQueries({ queryKey: ["fm_work_orders"] });
      qc.invalidateQueries({ queryKey: ["ppm_visits"] });
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
          <DialogTitle>{editing ? "Edit FM Service Report" : "New FM Service Report"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Visit details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Report No</Label>
                <Input value={form.report_no ?? ""} readOnly className="bg-muted" placeholder="Auto-generated" />
              </div>
              <div className="space-y-1">
                <Label>Service Date</Label>
                <Input type="date" value={form.service_date ?? ""} onChange={(e) => set("service_date", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Technician</Label>
                <Popover open={technicianOpen} onOpenChange={setTechnicianOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
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
                          {technicians.map((name: string) => (
                            <CommandItem key={name} onSelect={() => { set("technician_name", name); setTechnicianOpen(false); }}>{name}</CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <Label>Time Checked In</Label>
                <Input type="time" value={form.time_checked_in ?? ""} onChange={(e) => set("time_checked_in", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Time Checked Out</Label>
                <Input type="time" value={form.time_checked_out ?? ""} onChange={(e) => set("time_checked_out", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Client Representative</Label>
                <Input value={form.client_representative ?? ""} onChange={(e) => set("client_representative", e.target.value)} />
              </div>
              <div className="space-y-1 md:col-span-3">
                <Label>Work Order</Label>
                <Select value={form.work_order_id || undefined} onValueChange={applyWorkOrder}>
                  <SelectTrigger><SelectValue placeholder="Select work order..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {workOrders.map((o: any) => (
                      <SelectItem key={o.id} value={o.id}>
                        {(o.wo_no ? `${o.wo_no} — ` : "") + (o.customer_name ?? "Customer") + (o.service_type ? ` — ${o.service_type}` : "") + ` (${o.status})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 md:col-span-2">
                <Label>Contract</Label>
                <Select value={form.contract_id || undefined} onValueChange={pickContract}>
                  <SelectTrigger><SelectValue placeholder="Select contract..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {contracts.map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{(c.contract_no ? `${c.contract_no} — ` : "") + (c.customer_name ?? c.title ?? "Untitled")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Customer</Label>
                <Input value={form.customer_name ?? ""} onChange={(e) => set("customer_name", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Asset</Label>
                <Select value={form.asset_id || undefined} onValueChange={pickAsset} disabled={!form.contract_id}>
                  <SelectTrigger><SelectValue placeholder="Select asset..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {assets.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>{[a.asset_tag, a.asset_type, a.description].filter(Boolean).join(" - ") || "Asset"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Service Category</Label>
                <Select value={form.service_category_id || undefined} onValueChange={(v) => set("service_category_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select category..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {categories.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Service Type</Label>
                <Select value={form.service_type || undefined} onValueChange={(v) => set("service_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select type..." /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {SERVICE_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Location / Unit</Label>
                <Input value={form.location ?? ""} onChange={(e) => set("location", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Completion Type</Label>
                <Select value={form.completion_type || undefined} onValueChange={(v) => set("completion_type", v)}>
                  <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                  <SelectContent>
                    {COMPLETION_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status || undefined} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    {REPORT_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 pt-6">
                <Switch checked={form.follow_up_required} onCheckedChange={(v) => set("follow_up_required", v)} />
                <Label>Follow-up required</Label>
              </div>
            </div>
            <div className="space-y-1">
              <Label>Defects Found</Label>
              <Textarea rows={2} value={form.defects_found ?? ""} onChange={(e) => set("defects_found", e.target.value)} />
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Work carried out</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setItems((a) => [...a, emptyItem()])}>
                <Plus className="h-4 w-4 mr-1" /> Add work item
              </Button>
            </div>
            <div className="space-y-3">
              {items.map((it, idx) => {
                const upd = (k: keyof WorkItem, v: string) => setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, [k]: v } : x)));
                return (
                  <Card key={idx} className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
                      {items.length > 1 && (
                        <Button type="button" size="icon" variant="ghost" onClick={() => setItems((arr) => arr.filter((_, i) => i !== idx))}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label>Problem Reported</Label>
                        <Textarea rows={3} value={it.problem} onChange={(e) => upd("problem", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Work Done</Label>
                        <Textarea rows={3} value={it.work} onChange={(e) => upd("work", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Parts Used</Label>
                        <Textarea rows={2} value={it.parts} onChange={(e) => upd("parts", e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Hours Spent</Label>
                        <Input type="number" step="0.25" value={it.hours} onChange={(e) => upd("hours", e.target.value)} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">Total hours: {items.reduce((s, it) => s + (Number(it.hours) || 0), 0) || 0}</p>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Before / After photos</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setPhotos((p) => [...p, { caption: "" }])}>
                <Plus className="h-4 w-4 mr-1" /> Add pair
              </Button>
            </div>
            {photos.filter((p) => !p._deleted).length === 0 && <p className="text-sm text-muted-foreground">No photo pairs yet.</p>}
            <div className="space-y-3">
              {photos.map((p, idx) => p._deleted ? null : (
                <Card key={idx} className="p-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Input
                      placeholder="Caption (e.g. AHU-3 filter — plant room)"
                      value={p.caption ?? ""}
                      onChange={(e) => setPhotos((arr) => arr.map((x, i) => (i === idx ? { ...x, caption: e.target.value } : x)))}
                    />
                    <Button
                      type="button" size="icon" variant="ghost"
                      onClick={() => setPhotos((arr) => (arr[idx]?.id ? arr.map((x, i) => (i === idx ? { ...x, _deleted: true } : x)) : arr.filter((_, i) => i !== idx)))}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {(["before", "after"] as const).map((side) => {
                      const file = side === "before" ? p.beforeFile : p.afterFile;
                      const path = side === "before" ? p.before_path : p.after_path;
                      return (
                        <div key={side} className="space-y-1">
                          <Label className="capitalize">{side}</Label>
                          <div className="rounded-md border border-dashed p-3 text-center space-y-2">
                            {file ? (
                              <img src={URL.createObjectURL(file)} alt={side} className="mx-auto h-28 object-contain rounded" />
                            ) : path ? (
                              <p className="text-xs text-muted-foreground truncate">Saved image</p>
                            ) : (
                              <ImagePlus className="h-6 w-6 mx-auto text-muted-foreground" />
                            )}
                            <Input
                              type="file" accept="image/*" capture="environment"
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                setPhotos((arr) => arr.map((x, i) => (i === idx ? { ...x, [side === "before" ? "beforeFile" : "afterFile"]: f } : x)));
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Next visit &amp; sign-off</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Recommendations</Label>
                <Textarea rows={3} value={form.recommendations ?? ""} onChange={(e) => set("recommendations", e.target.value)} />
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Next Service Due</Label>
                  <Input type="date" value={form.next_service_date ?? ""} onChange={(e) => set("next_service_date", e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Signed By (client)</Label>
                  <Input value={form.signed_by ?? ""} onChange={(e) => set("signed_by", e.target.value)} />
                </div>
              </div>
            </div>
            <SignaturePad value={form.signature_data} onChange={(v) => set("signature_data", v ?? "")} />
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Update Report" : "Create Report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
