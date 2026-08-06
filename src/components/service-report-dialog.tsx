import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Plus, Trash2, ImagePlus, Loader2, Star, FileDown, ChevronsUpDown } from "lucide-react";

import { toast } from "sonner";
import { SignaturePad } from "@/components/signature-pad";
import { SERVICE_TYPES, REPORT_STATUS, MATERIAL_SUPPLIED_BY, WORK_ITEM_STATUS, type PhotoRow } from "@/lib/service-reports";
import { buildServiceReportPdf } from "@/lib/service-report-pdf";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
  /** Pre-select this work order when creating a new report */
  workOrderId?: string | null;
};

const empty = {
  report_no: "",
  work_order_id: "",
  contract_id: "",
  customer_id: "",
  customer_name: "",
  service_date: new Date().toISOString().slice(0, 10),
  technician_name: "",
  service_type: "",
  location: "",
  time_checked_in: "",
  time_checked_out: "",
  problem_reported: "",
  work_done: "",
  parts_used: "",
  hours_spent: "",
  handyman_hours: "",
  material_supplied_by: "",
  amount_received: "",
  balance_amount: "",
  recommendations: "",
  next_service_date: "",
  google_rating: "",
  google_review: "",
  signed_by: "",
  signature_data: "",
  status: "Draft",
};

const ITEM_SEP = "\n---\n";

type WorkItem = { problem: string; work: string; parts: string; hours: string; status: string };
const emptyItem = (): WorkItem => ({ problem: "", work: "", parts: "", hours: "", status: "" });

function splitField(v: string | null | undefined): string[] {
  return (v ?? "").split(ITEM_SEP);
}

function itemsFromReport(r: any): WorkItem[] {
  const p = splitField(r?.problem_reported);
  const w = splitField(r?.work_done);
  const pa = splitField(r?.parts_used);
  const st = splitField(r?.item_status);
  const n = Math.max(p.length, w.length, pa.length, st.length, 1);
  const items: WorkItem[] = [];
  for (let i = 0; i < n; i++) {
    items.push({
      problem: p[i] ?? "",
      work: w[i] ?? "",
      parts: pa[i] ?? "",
      status: st[i] ?? "",
      hours: i === 0 ? (r?.hours_spent ?? "") === null ? "" : String(r?.hours_spent ?? "") : "",
    });
  }
  return items;
}

export function ServiceReportDialog({ open, onOpenChange, editing, workOrderId }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(empty);
  const [items, setItems] = useState<WorkItem[]>([emptyItem()]);
  const [pairs, setPairs] = useState<PhotoRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [technicianOpen, setTechnicianOpen] = useState(false);

  const { data: technicians = [] } = useQuery({
    queryKey: ["employees-for-work-order"],
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
    queryKey: ["contracts-for-service"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contracts")
        .select("id, title, contract_no, customer_id, customer_name, handyman_hours")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: handymanLog = [] } = useQuery({
    queryKey: ["handyman_hours_log_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("handyman_hours_log").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: workOrders = [] } = useQuery({
    queryKey: ["work-orders-for-report"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("work_orders")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

  function applyWorkOrder(id: string, wo?: any) {
    const o: any = wo ?? workOrders.find((x: any) => x.id === id);
    if (!o) { setForm((f: any) => ({ ...f, work_order_id: id })); return; }
    setForm((f: any) => ({
      ...f,
      work_order_id: id,
      contract_id: o.contract_id ?? f.contract_id,
      customer_id: o.customer_id ?? f.customer_id,
      customer_name: o.customer_name ?? f.customer_name,
      technician_name: o.technician_name ?? f.technician_name,
      service_type: o.service_type ?? f.service_type,
      location: o.location ?? f.location,
      service_date: o.scheduled_date ?? f.service_date,
    }));
    const problems = (o.problem_reported ?? "").split(ITEM_SEP);
    const requested = (o.work_requested ?? "").split(ITEM_SEP);
    const n = Math.max(problems.length, requested.length, 1);
    setItems(
      Array.from({ length: n }).map((_, i) => ({
        problem: problems[i] ?? "",
        work: requested[i] ?? "",
        parts: "",
        hours: "",
        status: "",
      })),
    );
  }

  useEffect(() => {
    if (!open || editing || !workOrderId || !workOrders.length) return;
    applyWorkOrder(workOrderId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, workOrderId, workOrders]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        ...empty,
        ...editing,
        contract_id: editing.contract_id ?? "",
        customer_id: editing.customer_id ?? "",
        time_checked_in: (editing.time_checked_in ?? "").slice(0, 5),
        time_checked_out: (editing.time_checked_out ?? "").slice(0, 5),
      });
      setItems(itemsFromReport(editing));
      supabase
        .from("service_report_photos")
        .select("*")
        .eq("report_id", editing.id)
        .order("sort_order")
        .then(({ data }) => setPairs((data ?? []).map((p: any) => ({ ...p }))));
    } else {
      setForm(empty);
      setItems([emptyItem()]);
      setPairs([]);
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
      customer_id: c?.customer_id ?? f.customer_id,
      customer_name: c?.customer_name ?? f.customer_name,
    }));
  }

  const selectedContract: any = contracts.find((c: any) => c.id === form.contract_id);
  const allottedHours = Number(selectedContract?.handyman_hours ?? 0);
  const usedHoursOther = (handymanLog as any[])
    .filter((h) => h.contract_id === form.contract_id && h.report_id !== editing?.id)
    .reduce((s, h) => s + (Number(h.hours) || 0), 0);
  const thisHours = form.handyman_hours === "" ? 0 : Number(form.handyman_hours) || 0;
  const remainingHours = allottedHours - usedHoursOther - thisHours;

  async function uploadFile(reportId: string, file: File) {
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${reportId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("service-photos").upload(path, file, { upsert: false });
    if (error) throw error;
    return path;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const kept = items.filter((it) => it.problem || it.work || it.parts || it.hours || it.status);
      const list = kept.length ? kept : [emptyItem()];
      const totalHours = list.reduce((s, it) => s + (it.hours === "" ? 0 : Number(it.hours) || 0), 0);
      const payload: any = {
        report_no: form.report_no || null,
        work_order_id: form.work_order_id || null,
        contract_id: form.contract_id || null,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name || null,
        service_date: form.service_date || null,
        technician_name: form.technician_name || null,
        service_type: form.service_type || null,
        location: form.location || null,
        time_checked_in: form.time_checked_in || null,
        time_checked_out: form.time_checked_out || null,
        problem_reported: list.map((it) => it.problem).join(ITEM_SEP) || null,
        work_done: list.map((it) => it.work).join(ITEM_SEP) || null,
        parts_used: list.map((it) => it.parts).join(ITEM_SEP) || null,
        item_status: list.map((it) => it.status).join(ITEM_SEP) || null,
        hours_spent: totalHours || null,
        handyman_hours: form.handyman_hours === "" ? null : Number(form.handyman_hours),
        material_supplied_by: form.material_supplied_by || null,
        amount_received: form.amount_received === "" ? null : Number(form.amount_received),
        balance_amount: form.balance_amount === "" ? null : Number(form.balance_amount),

        recommendations: form.recommendations || null,
        next_service_date: form.next_service_date || null,
        google_rating: form.google_rating ? Number(form.google_rating) : null,
        google_review: form.google_review || null,
        signed_by: form.signed_by || null,
        signature_data: form.signature_data || null,
        status: form.status || "Draft",
      };

      let reportId = editing?.id as string | undefined;
      if (reportId) {
        const { error } = await supabase.from("service_reports").update(payload).eq("id", reportId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("service_reports").insert(payload).select("id").single();
        if (error) throw error;
        reportId = data.id;
      }

      // photos
      const removedIds = (pairs.filter((p) => p._deleted && p.id).map((p) => p.id) as string[]);
      if (removedIds.length) {
        await supabase.from("service_report_photos").delete().in("id", removedIds);
      }
      let order = 0;
      for (const p of pairs) {
        if (p._deleted) continue;
        const beforePath = p.beforeFile ? await uploadFile(reportId!, p.beforeFile) : p.before_path ?? null;
        const afterPath = p.afterFile ? await uploadFile(reportId!, p.afterFile) : p.after_path ?? null;
        const row = {
          report_id: reportId!,
          caption: p.caption || null,
          before_path: beforePath,
          after_path: afterPath,
          sort_order: order++,
        };
        if (p.id) {
          const { error } = await supabase.from("service_report_photos").update(row).eq("id", p.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("service_report_photos").insert(row);
          if (error) throw error;
        }
      }

      // handyman hours log (one entry per report)
      const hrs = form.handyman_hours === "" ? 0 : Number(form.handyman_hours) || 0;
      const { data: existingLog } = await supabase
        .from("handyman_hours_log")
        .select("id")
        .eq("report_id", reportId!)
        .maybeSingle();
      if (hrs > 0 && form.contract_id) {
        const logRow = {
          contract_id: form.contract_id,
          report_id: reportId!,
          customer_id: form.customer_id || null,
          customer_name: form.customer_name || null,
          log_date: form.service_date || new Date().toISOString().slice(0, 10),
          hours: hrs,
          notes: form.report_no ? `Report ${form.report_no}` : null,
        };
        if (existingLog?.id) {
          const { error } = await supabase.from("handyman_hours_log").update(logRow).eq("id", existingLog.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("handyman_hours_log").insert(logRow);
          if (error) throw error;
        }
      } else if (existingLog?.id) {
        await supabase.from("handyman_hours_log").delete().eq("id", existingLog.id);
      }
      qc.invalidateQueries({ queryKey: ["handyman_hours_log_all"] });
      qc.invalidateQueries({ queryKey: ["contracts"] });


      if (form.work_order_id) {
        await supabase
          .from("work_orders")
          .update({ status: (form.status || "Draft") === "Completed" ? "Completed" : "In Progress" })
          .eq("id", form.work_order_id);
        qc.invalidateQueries({ queryKey: ["work_orders"] });
      }

      toast.success(editing ? "Work completion report updated" : "Work completion report created");
      qc.invalidateQueries({ queryKey: ["service_reports"] });
      onOpenChange(false);
    } catch (err: any) {
      toast.error(err.message ?? "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleDownloadPdf() {
    setGeneratingPdf(true);
    try {
      const { doc, fileName } = await buildServiceReportPdf(form, items, { allottedHours, usedHoursOther });
      const blob = doc.output("blob");
      const file = new File([blob], fileName, { type: "application/pdf" });
      const nav = navigator as Navigator & { canShare?: (data?: ShareData) => boolean };

      if (nav.canShare?.({ files: [file] })) {
        try {
          await navigator.share({
            files: [file],
            title: fileName,
            text: `Work Completion Report ${form.report_no || ""}`.trim(),
          });
          return;
        } catch (err: any) {
          if (err?.name === "AbortError") return;
        }
      }

      doc.save(fileName);
      toast.success("PDF downloaded. Attach it in WhatsApp to share.");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to generate PDF");
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Work Completion Report</DialogTitle>
        </DialogHeader>

        <form onSubmit={save} className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Visit details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Report No</Label>
                <Input value={form.report_no ?? ""} onChange={(e) => set("report_no", e.target.value)} placeholder="SR-0001" />
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
                            <CommandItem key={name} onSelect={() => { set("technician_name", name); setTechnicianOpen(false); }}>
                              {name}
                            </CommandItem>
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
              <div className="space-y-1 md:col-span-3">
                <Label>Work Order</Label>
                <Select value={form.work_order_id || undefined} onValueChange={(v) => applyWorkOrder(v)}>
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
                      <SelectItem key={c.id} value={c.id}>
                        {(c.contract_no ? `${c.contract_no} — ` : "") + (c.customer_name ?? c.title ?? "Untitled")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Customer</Label>
                <Input value={form.customer_name ?? ""} onChange={(e) => set("customer_name", e.target.value)} />
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
                <Label>Status</Label>
                <Select value={form.status || undefined} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    {REPORT_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
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
                const upd = (k: keyof WorkItem, v: string) =>
                  setItems((arr) => arr.map((x, i) => (i === idx ? { ...x, [k]: v } : x)));
                return (
                  <Card key={idx} className="p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">Item {idx + 1}</span>
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
                      <div className="space-y-1">
                        <Label>Status</Label>
                        <Select value={it.status || undefined} onValueChange={(v) => upd("status", v)}>
                          <SelectTrigger><SelectValue placeholder="Select status..." /></SelectTrigger>
                          <SelectContent>
                            {WORK_ITEM_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              Total hours: {items.reduce((s, it) => s + (Number(it.hours) || 0), 0) || 0}
            </p>

            <Card className="p-3 space-y-2">
              <div className="text-sm font-medium">Handyman Hours</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                <div className="space-y-1">
                  <Label>Handyman Hours Used (this visit)</Label>
                  <Input
                    type="number"
                    step="0.25"
                    min="0"
                    value={form.handyman_hours ?? ""}
                    onChange={(e) => set("handyman_hours", e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="text-sm">
                  {form.contract_id ? (
                    <div className="space-y-1">
                      <div className="text-muted-foreground text-xs">
                        Contract allowance {allottedHours} h · already used {usedHoursOther} h ·{" "}
                        <span className="font-medium">{allottedHours - usedHoursOther} h left</span>
                      </div>
                      <div className={remainingHours < 0 ? "font-semibold text-destructive" : "font-semibold text-emerald-600"}>
                        {remainingHours < 0
                          ? `Exceeds allowance by ${Math.abs(remainingHours)} h`
                          : `Balance after this report: ${remainingHours} h`}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">Select a contract to deduct hours from its allowance.</p>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-3 space-y-2">
              <div className="text-sm font-medium">Materials &amp; Payment</div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Material Used - Supplied By</Label>
                  <Select value={form.material_supplied_by || undefined} onValueChange={(v) => set("material_supplied_by", v)}>
                    <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                    <SelectContent>
                      {MATERIAL_SUPPLIED_BY.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Amount Received</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.amount_received ?? ""}
                    onChange={(e) => set("amount_received", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label>Balance Amount</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.balance_amount ?? ""}
                    onChange={(e) => set("balance_amount", e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </Card>

          </section>


          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Before / After photos</h3>
              <Button type="button" size="sm" variant="outline" onClick={() => setPairs((p) => [...p, { caption: "" }])}>
                <Plus className="h-4 w-4 mr-1" /> Add pair
              </Button>
            </div>
            {pairs.filter((p) => !p._deleted).length === 0 && (
              <p className="text-sm text-muted-foreground">No photo pairs yet.</p>
            )}
            <div className="space-y-3">
              {pairs.map((p, idx) =>
                p._deleted ? null : (
                  <Card key={idx} className="p-3 space-y-3">
                    <div className="flex items-center gap-2">
                      <Input
                        placeholder="Caption (e.g. AC indoor unit — living room)"
                        value={p.caption ?? ""}
                        onChange={(e) =>
                          setPairs((arr) => arr.map((x, i) => (i === idx ? { ...x, caption: e.target.value } : x)))
                        }
                      />
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          setPairs((arr) =>
                            arr[idx]?.id
                              ? arr.map((x, i) => (i === idx ? { ...x, _deleted: true } : x))
                              : arr.filter((_, i) => i !== idx),
                          )
                        }
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
                                <img src={URL.createObjectURL(file)} alt={`${side}`} className="mx-auto h-28 object-contain rounded" />
                              ) : path ? (
                                <p className="text-xs text-muted-foreground truncate">Saved image</p>
                              ) : (
                                <ImagePlus className="h-6 w-6 mx-auto text-muted-foreground" />
                              )}
                              <Input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (!f) return;
                                  setPairs((arr) =>
                                    arr.map((x, i) =>
                                      i === idx ? { ...x, [side === "before" ? "beforeFile" : "afterFile"]: f } : x,
                                    ),
                                  );
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                ),
              )}
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
                  <Label>Signed By (customer)</Label>
                  <Input value={form.signed_by ?? ""} onChange={(e) => set("signed_by", e.target.value)} />
                </div>
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-3">
              <div className="text-sm font-medium">Google Feedback</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Google Rating</Label>
                  <div className="flex items-center gap-1">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <button
                        key={n}
                        type="button"
                        aria-label={`${n} star`}
                        onClick={() => set("google_rating", String(form.google_rating) === String(n) ? "" : String(n))}
                        className="p-1"
                      >
                        <Star
                          className={`h-6 w-6 ${Number(form.google_rating) >= n ? "fill-amber-400 text-amber-400" : "text-muted-foreground"}`}
                        />
                      </button>
                    ))}
                    <span className="ml-2 text-sm text-muted-foreground">
                      {form.google_rating ? `${form.google_rating}/5` : "Not rated"}
                    </span>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Google Review</Label>
                  <Textarea
                    rows={3}
                    placeholder="Customer's Google review text or link"
                    value={form.google_review ?? ""}
                    onChange={(e) => set("google_review", e.target.value)}
                  />
                </div>
              </div>
            </div>
            <SignaturePad value={form.signature_data} onChange={(v) => set("signature_data", v ?? "")} />

          </section>

          <DialogFooter>
            <Button type="button" variant="secondary" onClick={handleDownloadPdf} disabled={generatingPdf}>
              {generatingPdf ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
              Download PDF
            </Button>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? "Update Report" : "Create Completion Report"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
