import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card } from "@/components/ui/card";
import { Plus, Trash2, Loader2, ChevronsUpDown } from "lucide-react";
import { toast } from "sonner";
import { SERVICE_TYPES } from "@/lib/service-reports";
import { WO_STATUS, WO_PRIORITY, ITEM_SEP, splitItems } from "@/lib/work-orders";
import { nextDocNo } from "@/lib/doc-no";


type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: any | null;
};

const empty = {
  wo_no: "",
  contract_id: "",
  customer_id: "",
  customer_name: "",
  requested_date: new Date().toISOString().slice(0, 10),
  scheduled_date: "",
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

export function WorkOrderDialog({ open, onOpenChange, editing }: Props) {
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
      return (data ?? []).map((e: any) => e.full_name ?? [e.first_name, e.last_name].filter(Boolean).join(" "));
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({ ...empty, ...editing, contract_id: editing.contract_id ?? "", customer_id: editing.customer_id ?? "" });
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
      customer_id: c?.customer_id ?? f.customer_id,
      customer_name: c?.customer_name ?? f.customer_name,
    }));
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
        customer_id: form.customer_id || null,
        customer_name: form.customer_name || null,
        requested_date: form.requested_date || null,
        scheduled_date: form.scheduled_date || null,
        technician_name: form.technician_name || null,
        service_type: form.service_type || null,
        location: form.location || null,
        priority: form.priority || "Medium",
        problem_reported: list.map((it) => it.problem).join(ITEM_SEP) || null,
        work_requested: list.map((it) => it.work).join(ITEM_SEP) || null,
        notes: form.notes || null,
        status: form.status || "Open",
      };

      if (editing?.id) {
        const { error } = await supabase.from("work_orders").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("work_orders").insert(payload);
        if (error) throw error;
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
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Job details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label>Work Order No</Label>
                <Input value={form.wo_no ?? ""} readOnly className="bg-muted" placeholder="Auto-generated" />
              </div>
              <div className="space-y-1">
                <Label>Requested Date</Label>
                <Input type="date" value={form.requested_date ?? ""} onChange={(e) => set("requested_date", e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Scheduled Date</Label>
                <Input type="date" value={form.scheduled_date ?? ""} onChange={(e) => set("scheduled_date", e.target.value)} />
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
                <Label>Assigned To</Label>
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
                <Label>Priority</Label>
                <Select value={form.priority || undefined} onValueChange={(v) => set("priority", v)}>
                  <SelectTrigger><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    {WO_PRIORITY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={form.status || undefined} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    {WO_STATUS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Work requested</h3>
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
                        <Label>Work Requested</Label>
                        <Textarea rows={3} value={it.work} onChange={(e) => upd("work", e.target.value)} />
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          </section>

          <section className="space-y-1">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes ?? ""} onChange={(e) => set("notes", e.target.value)} />
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
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
