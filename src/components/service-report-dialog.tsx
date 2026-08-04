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
import { Plus, Trash2, ImagePlus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SignaturePad } from "@/components/signature-pad";
import { SERVICE_TYPES, REPORT_STATUS, type PhotoRow } from "@/lib/service-reports";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
};

const empty = {
  report_no: "",
  contract_id: "",
  customer_id: "",
  customer_name: "",
  service_date: new Date().toISOString().slice(0, 10),
  technician_name: "",
  service_type: "",
  location: "",
  problem_reported: "",
  work_done: "",
  parts_used: "",
  hours_spent: "",
  recommendations: "",
  next_service_date: "",
  signed_by: "",
  signature_data: "",
  status: "Draft",
};

export function ServiceReportDialog({ open, onOpenChange, editing }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState<any>(empty);
  const [pairs, setPairs] = useState<PhotoRow[]>([]);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({ ...empty, ...editing, contract_id: editing.contract_id ?? "", customer_id: editing.customer_id ?? "" });
      supabase
        .from("service_report_photos")
        .select("*")
        .eq("report_id", editing.id)
        .order("sort_order")
        .then(({ data }) => setPairs((data ?? []).map((p: any) => ({ ...p }))));
    } else {
      setForm(empty);
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
      const payload: any = {
        report_no: form.report_no || null,
        contract_id: form.contract_id || null,
        customer_id: form.customer_id || null,
        customer_name: form.customer_name || null,
        service_date: form.service_date || null,
        technician_name: form.technician_name || null,
        service_type: form.service_type || null,
        location: form.location || null,
        problem_reported: form.problem_reported || null,
        work_done: form.work_done || null,
        parts_used: form.parts_used || null,
        hours_spent: form.hours_spent === "" || form.hours_spent == null ? null : Number(form.hours_spent),
        recommendations: form.recommendations || null,
        next_service_date: form.next_service_date || null,
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

      toast.success(editing ? "Service report updated" : "Service report created");
      qc.invalidateQueries({ queryKey: ["service_reports"] });
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
          <DialogTitle>{editing ? "Edit Service Report" : "New Service Report"}</DialogTitle>
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
                <Input value={form.technician_name ?? ""} onChange={(e) => set("technician_name", e.target.value)} />
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
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Work carried out</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Problem Reported</Label>
                <Textarea rows={3} value={form.problem_reported ?? ""} onChange={(e) => set("problem_reported", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Work Done</Label>
                <Textarea rows={3} value={form.work_done ?? ""} onChange={(e) => set("work_done", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Parts Used</Label>
                <Textarea rows={2} value={form.parts_used ?? ""} onChange={(e) => set("parts_used", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Hours Spent</Label>
                <Input type="number" step="0.25" value={form.hours_spent ?? ""} onChange={(e) => set("hours_spent", e.target.value)} />
              </div>
            </div>
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
